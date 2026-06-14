import { Injectable } from '@nestjs/common';
import {
  Auction,
  AuctionBid,
  AuctionStatus,
  AuctionSettlementResult,
  GameState,
  PlayerState,
  MarketOrder,
  MarketOrderStatus,
  BidStatus,
  ProxyBid
} from '../types/game.types';
import { RedisService } from './redis.service';
import { TradeService } from './trade.service';
import { getPlantById } from '../data/plants.data';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuctionService {
  private readonly AUCTION_KEY_PREFIX = 'auction:';
  private readonly MIN_START_PRICE_RATIO = 0.5;
  private readonly MIN_INCREMENT_RATIO = 0.1;
  private readonly MIN_TURNS = 1;
  private readonly MAX_TURNS = 3;
  private readonly DEFAULT_TAX_RATE = 0.05;
  private readonly MAX_WITHDRAW_PER_AUCTION = 1;
  private readonly HISTORY_LIMIT = 20;

  constructor(
    private readonly redis: RedisService,
    private readonly tradeService: TradeService
  ) {}

  private getAuctionKey(gameId: string): string {
    return `${this.AUCTION_KEY_PREFIX}${gameId}`;
  }

  async getAuctions(gameId: string): Promise<Auction[]> {
    const auctions = await this.redis.getJSON<Auction[]>(this.getAuctionKey(gameId));
    return auctions || [];
  }

  async saveAuctions(gameId: string, auctions: Auction[]): Promise<void> {
    await this.redis.setJSON(this.getAuctionKey(gameId), auctions);
  }

  async clearAuctions(gameId: string): Promise<void> {
    await this.redis.del(this.getAuctionKey(gameId));
  }

  getAuctionLimits(speciesId: string): { minStartPrice: number; originalPrice: number } {
    const species = getPlantById(speciesId);
    const originalPrice = species?.price || 50;
    return {
      minStartPrice: Math.floor(originalPrice * this.MIN_START_PRICE_RATIO),
      originalPrice
    };
  }

  calculateMinIncrement(startPrice: number): number {
    return Math.floor(startPrice * this.MIN_INCREMENT_RATIO);
  }

  async createAuction(
    gameId: string,
    game: GameState,
    sellerId: string,
    speciesId: string,
    quantity: number,
    startPrice: number,
    minIncrement: number,
    totalTurns: number,
    buyNowPrice: number | null = null
  ): Promise<{ auction: Auction; game: GameState } | { error: string }> {
    const seller = game.players[sellerId];
    if (!seller) return { error: '玩家不存在' };
    if (seller.isBankrupt) return { error: '破产玩家无法发起拍卖' };

    if (quantity <= 0) return { error: '数量必须大于0' };

    const owned = seller.ownedSeeds[speciesId] || 0;
    if (owned < quantity) return { error: '种子数量不足' };

    const species = getPlantById(speciesId);
    if (!species) return { error: '未知物种' };

    const { minStartPrice, originalPrice } = this.getAuctionLimits(speciesId);
    if (startPrice < minStartPrice) {
      return { error: `起拍价不能低于 ${minStartPrice} 金币（原价 ${originalPrice} 的50%）` };
    }

    const requiredMinIncrement = this.calculateMinIncrement(startPrice);
    if (minIncrement < requiredMinIncrement) {
      return { error: `最低加价金额不能低于 ${requiredMinIncrement} 金币（起拍价的10%）` };
    }

    if (totalTurns < this.MIN_TURNS || totalTurns > this.MAX_TURNS) {
      return { error: `持续回合数必须在 ${this.MIN_TURNS} 到 ${this.MAX_TURNS} 之间` };
    }

    if (buyNowPrice !== null && buyNowPrice <= startPrice) {
      return { error: '一口价必须高于起拍价' };
    }

    const marketOrders = await this.tradeService.getMarketOrders(gameId);
    const hasActiveMarketOrder = marketOrders.some(
      o => o.sellerId === sellerId &&
           o.speciesId === speciesId &&
           o.status === MarketOrderStatus.ACTIVE
    );
    if (hasActiveMarketOrder) {
      return { error: '该种子已在挂单市场出售，不能同时在拍卖行拍卖' };
    }

    const auctions = await this.getAuctions(gameId);
    const hasActiveAuction = auctions.some(
      a => a.sellerId === sellerId &&
           a.speciesId === speciesId &&
           a.status === AuctionStatus.ACTIVE
    );
    if (hasActiveAuction) {
      return { error: '该种子已有进行中的拍卖，请先结束后再发起新拍卖' };
    }

    seller.ownedSeeds[speciesId] = owned - quantity;

    const auction: Auction = {
      id: uuidv4(),
      sellerId,
      sellerName: seller.name,
      speciesId,
      quantity,
      startPrice,
      minIncrement,
      totalTurns,
      turnsLeft: totalTurns,
      createdAtTurn: game.turn,
      currentHighBid: startPrice,
      currentHighBidderId: null,
      currentHighBidderName: null,
      bids: [],
      status: AuctionStatus.ACTIVE,
      winnerId: null,
      winnerName: null,
      finalPrice: null,
      settledAtTurn: null,
      buyNowPrice,
      proxyBids: [],
      withdrawCount: {}
    };

    auctions.push(auction);
    await this.saveAuctions(gameId, auctions);

    return { auction, game };
  }

  async cancelAuction(
    gameId: string,
    game: GameState,
    auctionId: string,
    playerId: string
  ): Promise<{ auction: Auction; game: GameState } | { error: string }> {
    const auctions = await this.getAuctions(gameId);
    const auctionIndex = auctions.findIndex(a => a.id === auctionId);

    if (auctionIndex === -1) return { error: '拍卖不存在' };

    const auction = auctions[auctionIndex];
    if (auction.sellerId !== playerId) return { error: '只能取消自己发起的拍卖' };
    if (auction.status !== AuctionStatus.ACTIVE) return { error: '该拍卖已无法取消' };
    if (auction.bids.length > 0) return { error: '已有人出价，无法取消拍卖' };

    const seller = game.players[auction.sellerId];
    if (seller) {
      seller.ownedSeeds[auction.speciesId] = (seller.ownedSeeds[auction.speciesId] || 0) + auction.quantity;
    }

    auction.status = AuctionStatus.CANCELLED;
    await this.saveAuctions(gameId, auctions);

    return { auction, game };
  }

  getActiveBids(auction: Auction): AuctionBid[] {
    return auction.bids.filter(b => b.status === BidStatus.ACTIVE);
  }

  getPlayerActiveBids(auction: Auction, playerId: string): AuctionBid[] {
    return this.getActiveBids(auction).filter(b => b.bidderId === playerId);
  }

  getCurrentHighestBid(auction: Auction): AuctionBid | null {
    const activeBids = this.getActiveBids(auction);
    if (activeBids.length === 0) return null;
    return activeBids.reduce((max, bid) => bid.amount > max.amount ? bid : max, activeBids[0]);
  }

  updateAuctionHighBid(auction: Auction): void {
    const highestBid = this.getCurrentHighestBid(auction);
    if (highestBid) {
      auction.currentHighBid = highestBid.amount;
      auction.currentHighBidderId = highestBid.bidderId;
      auction.currentHighBidderName = highestBid.bidderName;
    } else {
      auction.currentHighBid = auction.startPrice;
      auction.currentHighBidderId = null;
      auction.currentHighBidderName = null;
    }
  }

  getPlayerHighestActiveBid(auction: Auction, playerId: string): AuctionBid | null {
    const activeBids = this.getActiveBids(auction).filter(b => b.bidderId === playerId);
    if (activeBids.length === 0) return null;
    return activeBids.reduce((max, bid) => bid.amount > max.amount ? bid : max, activeBids[0]);
  }

  calculatePlayerAuctionCommitment(proxyBid: ProxyBid | undefined, highestBid: AuctionBid | null): number {
    if (proxyBid && highestBid) {
      return Math.max(proxyBid.maxPrice, highestBid.amount);
    }
    if (proxyBid) return proxyBid.maxPrice;
    if (highestBid) return highestBid.amount;
    return 0;
  }

  async getPlayerTotalCommittedBids(
    gameId: string,
    playerId: string
  ): Promise<number> {
    const auctions = await this.getAuctions(gameId);
    let total = 0;

    for (const auction of auctions) {
      if (auction.status !== AuctionStatus.ACTIVE) continue;

      const proxyBid = auction.proxyBids.find(p => p.bidderId === playerId);
      const playerHighestBid = this.getPlayerHighestActiveBid(auction, playerId);

      if (proxyBid && playerHighestBid) {
        total += Math.max(proxyBid.maxPrice, playerHighestBid.amount);
      } else if (proxyBid) {
        total += proxyBid.maxPrice;
      } else if (playerHighestBid) {
        total += playerHighestBid.amount;
      }
    }

    return total;
  }

  async withdrawBid(
    gameId: string,
    auctionId: string,
    bidderId: string
  ): Promise<{ auction: Auction; bid: AuctionBid } | { error: string }> {
    const auctions = await this.getAuctions(gameId);
    const auctionIndex = auctions.findIndex(a => a.id === auctionId);

    if (auctionIndex === -1) return { error: '拍卖不存在' };

    const auction = auctions[auctionIndex];
    if (auction.status !== AuctionStatus.ACTIVE) return { error: '拍卖已结束或已取消' };

    const withdrawCount = auction.withdrawCount[bidderId] || 0;
    if (withdrawCount >= this.MAX_WITHDRAW_PER_AUCTION) {
      return { error: `每场拍卖最多只能撤回 ${this.MAX_WITHDRAW_PER_AUCTION} 次出价` };
    }

    const activeBids = this.getActiveBids(auction);
    const otherActiveBids = activeBids.filter(b => b.bidderId !== bidderId);
    if (otherActiveBids.length === 0) {
      return { error: '你是唯一出价者，无法撤回出价' };
    }

    const myActiveBids = this.getPlayerActiveBids(auction, bidderId);
    if (myActiveBids.length === 0) {
      return { error: '没有可撤回的出价' };
    }

    const myLatestBid = myActiveBids.reduce((latest, bid) =>
      bid.createdAt > latest.createdAt ? bid : latest, myActiveBids[0]
    );

    myLatestBid.status = BidStatus.WITHDRAWN;
    auction.withdrawCount[bidderId] = withdrawCount + 1;

    this.updateAuctionHighBid(auction);

    await this.saveAuctions(gameId, auctions);

    return { auction, bid: myLatestBid };
  }

  async processProxyBids(
    gameId: string,
    game: GameState,
    auctionId: string
  ): Promise<{ auction: Auction; autoBids: AuctionBid[]; settled?: AuctionSettlementResult }> {
    const autoBids: AuctionBid[] = [];
    let settledResult: AuctionSettlementResult | undefined;

    let auctions = await this.getAuctions(gameId);
    let auctionIdx = auctions.findIndex(a => a.id === auctionId);
    if (auctionIdx === -1) {
      return { auction: {} as Auction, autoBids, settled: settledResult };
    }
    let auction = auctions[auctionIdx];

    if (auction.status !== AuctionStatus.ACTIVE) {
      return { auction, autoBids, settled: settledResult };
    }

    if (auction.proxyBids.length === 0) {
      return { auction, autoBids, settled: settledResult };
    }

    const highestBid = this.getCurrentHighestBid(auction);
    const currentHigh = highestBid ? highestBid.amount : auction.startPrice - auction.minIncrement;
    const currentHighBidderId = highestBid?.bidderId || '';
    const inc = auction.minIncrement;

    const eligibleProxies = auction.proxyBids
      .filter(p => p.bidderId !== currentHighBidderId)
      .filter(p => p.maxPrice >= currentHigh + inc)
      .sort((a, b) => b.maxPrice - a.maxPrice);

    if (eligibleProxies.length === 0) {
      return { auction, autoBids, settled: settledResult };
    }

    if (eligibleProxies.length === 1) {
      const proxy = eligibleProxies[0];
      const bidAmount = Math.min(proxy.maxPrice, currentHigh + inc);
      const result = await this.placeBidInternal(gameId, game, auctionId, proxy.bidderId, bidAmount, true);
      if (!('error' in result)) {
        autoBids.push(result.bid);
        if (result.settled) settledResult = result.settled;
      }
    } else {
      const topProxy = eligibleProxies[0];
      const secondMaxPrice = eligibleProxies[1].maxPrice;

      if (topProxy.maxPrice > secondMaxPrice) {
        const secondProxy = eligibleProxies[1];
        const secondBidAmount = Math.min(secondProxy.maxPrice, currentHigh + inc);
        const secondResult = await this.placeBidInternal(gameId, game, auctionId, secondProxy.bidderId, secondBidAmount, true);
        if (!('error' in secondResult)) {
          autoBids.push(secondResult.bid);
          if (secondResult.settled) {
            settledResult = secondResult.settled;
          }
        }

        if (!settledResult) {
          const winningBidAmount = Math.min(topProxy.maxPrice, secondMaxPrice + inc);
          const winResult = await this.placeBidInternal(gameId, game, auctionId, topProxy.bidderId, winningBidAmount, true);
          if (!('error' in winResult)) {
            autoBids.push(winResult.bid);
            if (winResult.settled) settledResult = winResult.settled;
          }
        }
      } else {
        const firstEligible = eligibleProxies[0];
        const bidAmount = Math.min(firstEligible.maxPrice, currentHigh + inc);
        const result = await this.placeBidInternal(gameId, game, auctionId, firstEligible.bidderId, bidAmount, true);
        if (!('error' in result)) {
          autoBids.push(result.bid);
          if (result.settled) settledResult = result.settled;
        }
      }
    }

    if (!settledResult) {
      let remaining = true;
      let guard = 0;
      while (remaining && guard < 10) {
        guard++;
        remaining = false;

        auctions = await this.getAuctions(gameId);
        auctionIdx = auctions.findIndex(a => a.id === auctionId);
        if (auctionIdx === -1) break;
        auction = auctions[auctionIdx];
        if (auction.status !== AuctionStatus.ACTIVE) break;

        const cur = this.getCurrentHighestBid(auction);
        const curHigh = cur ? cur.amount : auction.startPrice - auction.minIncrement;
        const curBidderId = cur?.bidderId || '';

        const stillEligible = auction.proxyBids
          .filter(p => p.bidderId !== curBidderId)
          .filter(p => p.maxPrice >= curHigh + inc)
          .sort((a, b) => b.maxPrice - a.maxPrice);

        if (stillEligible.length === 0) break;

        if (stillEligible.length === 1) {
          const proxy = stillEligible[0];
          const bidAmount = Math.min(proxy.maxPrice, curHigh + inc);
          const result = await this.placeBidInternal(gameId, game, auctionId, proxy.bidderId, bidAmount, true);
          if ('error' in result) break;
          autoBids.push(result.bid);
          if (result.settled) { settledResult = result.settled; break; }
          remaining = true;
        } else {
          const top = stillEligible[0];
          const secondMax = stillEligible[1].maxPrice;

          if (top.maxPrice > secondMax) {
            const second = stillEligible[1];
            const secondBid = Math.min(second.maxPrice, curHigh + inc);
            const secResult = await this.placeBidInternal(gameId, game, auctionId, second.bidderId, secondBid, true);
            if (!('error' in secResult)) {
              autoBids.push(secResult.bid);
              if (secResult.settled) { settledResult = secResult.settled; break; }
            }

            const winBid = Math.min(top.maxPrice, secondMax + inc);
            const winResult = await this.placeBidInternal(gameId, game, auctionId, top.bidderId, winBid, true);
            if (!('error' in winResult)) {
              autoBids.push(winResult.bid);
              if (winResult.settled) { settledResult = winResult.settled; break; }
            }
            remaining = true;
          } else {
            const firstElig = stillEligible[0];
            const bidAmount = Math.min(firstElig.maxPrice, curHigh + inc);
            const result = await this.placeBidInternal(gameId, game, auctionId, firstElig.bidderId, bidAmount, true);
            if ('error' in result) break;
            autoBids.push(result.bid);
            if (result.settled) { settledResult = result.settled; break; }
            remaining = true;
          }
        }
      }
    }

    auctions = await this.getAuctions(gameId);
    auctionIdx = auctions.findIndex(a => a.id === auctionId);
    const finalAuction = auctionIdx !== -1 ? auctions[auctionIdx] : auction;

    return {
      auction: finalAuction,
      autoBids,
      settled: settledResult
    };
  }

  private async placeBidInternal(
    gameId: string,
    game: GameState,
    auctionId: string,
    bidderId: string,
    bidAmount: number,
    isAuto: boolean = false
  ): Promise<{ auction: Auction; bid: AuctionBid; settled?: AuctionSettlementResult } | { error: string }> {
    const auctions = await this.getAuctions(gameId);
    const auctionIndex = auctions.findIndex(a => a.id === auctionId);

    if (auctionIndex === -1) return { error: '拍卖不存在' };

    const auction = auctions[auctionIndex];
    if (auction.status !== AuctionStatus.ACTIVE) return { error: '拍卖已结束或已取消' };
    if (auction.sellerId === bidderId) return { error: '不能对自己发起的拍卖出价' };

    const bidder = game.players[bidderId];
    if (!bidder) return { error: '玩家不存在' };
    if (bidder.isBankrupt) return { error: '破产玩家无法参与竞价' };

    const activeBids = this.getActiveBids(auction);
    const minRequiredBid = activeBids.length === 0
      ? auction.startPrice
      : auction.currentHighBid + auction.minIncrement;
    if (bidAmount < minRequiredBid) {
      const hint = activeBids.length === 0
        ? '起拍价'
        : `当前最高价 + 最低加价`;
      return { error: `出价必须至少为 ${minRequiredBid} 金币（${hint}）` };
    }

    if (auction.buyNowPrice !== null && bidAmount >= auction.buyNowPrice) {
      bidAmount = auction.buyNowPrice;
    }

    const playerCommitted = await this.getPlayerTotalCommittedBids(gameId, bidderId);
    let newCommitted = playerCommitted;

    const existingProxyBid = auction.proxyBids.find(p => p.bidderId === bidderId);
    const myHighestBid = this.getPlayerHighestActiveBid(auction, bidderId);

    const oldCommitment = this.calculatePlayerAuctionCommitment(existingProxyBid, myHighestBid);
    const newMyHighestBidAmount = Math.max(myHighestBid?.amount || 0, bidAmount);
    const newCommitment = this.calculatePlayerAuctionCommitment(
      existingProxyBid,
      { amount: newMyHighestBidAmount } as AuctionBid
    );

    newCommitted = playerCommitted - oldCommitment + newCommitment;

    if (bidder.money < newCommitted) {
      return { error: `余额不足，当前可用余额：${bidder.money} 金币，参与拍卖总承诺金额需：${newCommitted} 金币` };
    }

    const bid: AuctionBid = {
      id: uuidv4(),
      auctionId,
      bidderId,
      bidderName: bidder.name,
      amount: bidAmount,
      createdAt: Date.now(),
      createdAtTurn: game.turn,
      status: BidStatus.ACTIVE,
      isAuto
    };

    auction.bids.push(bid);
    this.updateAuctionHighBid(auction);

    await this.saveAuctions(gameId, auctions);

    let settledResult: AuctionSettlementResult | undefined;

    if (auction.buyNowPrice !== null && bidAmount >= auction.buyNowPrice) {
      const settleResult = await this.settleAuction(gameId, game, auction);
      game = settleResult.game;
      settledResult = settleResult.result;
    }

    const result: { auction: Auction; bid: AuctionBid; settled?: AuctionSettlementResult } = {
      auction,
      bid
    };
    if (settledResult) {
      result.settled = settledResult;
    }

    return result;
  }

  async placeBid(
    gameId: string,
    game: GameState,
    auctionId: string,
    bidderId: string,
    bidAmount: number,
    isAuto: boolean = false
  ): Promise<{ auction: Auction; bid: AuctionBid; autoBids?: AuctionBid[]; settled?: AuctionSettlementResult } | { error: string }> {
    const result = await this.placeBidInternal(gameId, game, auctionId, bidderId, bidAmount, isAuto);

    if ('error' in result) {
      return result;
    }

    if (result.settled) {
      return {
        auction: result.auction,
        bid: result.bid,
        settled: result.settled
      };
    }

    if (!isAuto) {
      const proxyResult = await this.processProxyBids(gameId, game, auctionId);
      return {
        auction: proxyResult.auction,
        bid: result.bid,
        autoBids: proxyResult.autoBids,
        settled: proxyResult.settled
      };
    }

    return {
      auction: result.auction,
      bid: result.bid
    };
  }

  async setProxyBid(
    gameId: string,
    game: GameState,
    auctionId: string,
    bidderId: string,
    maxPrice: number
  ): Promise<{ auction: Auction; autoBids: AuctionBid[]; settled?: AuctionSettlementResult } | { error: string }> {
    const auctions = await this.getAuctions(gameId);
    const auctionIndex = auctions.findIndex(a => a.id === auctionId);

    if (auctionIndex === -1) return { error: '拍卖不存在' };

    const auction = auctions[auctionIndex];
    if (auction.status !== AuctionStatus.ACTIVE) return { error: '拍卖已结束或已取消' };
    if (auction.sellerId === bidderId) return { error: '不能对自己发起的拍卖设置代理出价' };

    const bidder = game.players[bidderId];
    if (!bidder) return { error: '玩家不存在' };
    if (bidder.isBankrupt) return { error: '破产玩家无法参与竞价' };

    if (maxPrice < auction.startPrice) {
      return { error: `代理出价最高金额不能低于起拍价 ${auction.startPrice} 金币` };
    }

    if (auction.buyNowPrice !== null && maxPrice >= auction.buyNowPrice) {
      maxPrice = auction.buyNowPrice;
    }

    const existingProxyBid = auction.proxyBids.find(p => p.bidderId === bidderId);
    const myHighestBid = this.getPlayerHighestActiveBid(auction, bidderId);
    const playerCommitted = await this.getPlayerTotalCommittedBids(gameId, bidderId);

    const oldCommitment = this.calculatePlayerAuctionCommitment(existingProxyBid, myHighestBid);
    const newCommitment = this.calculatePlayerAuctionCommitment(
      { bidderId, bidderName: bidder.name, maxPrice, createdAt: Date.now() } as ProxyBid,
      myHighestBid
    );

    const newCommitted = playerCommitted - oldCommitment + newCommitment;

    if (bidder.money < newCommitted) {
      return { error: `余额不足，当前可用余额：${bidder.money} 金币，代理出价最高金额需：${newCommitted} 金币` };
    }

    const proxyBid: ProxyBid = {
      bidderId,
      bidderName: bidder.name,
      maxPrice,
      createdAt: Date.now()
    };

    if (existingProxyBid) {
      existingProxyBid.maxPrice = maxPrice;
      existingProxyBid.createdAt = Date.now();
    } else {
      auction.proxyBids.push(proxyBid);
    }

    await this.saveAuctions(gameId, auctions);

    const proxyResult = await this.processProxyBids(gameId, game, auctionId);

    return proxyResult;
  }

  async getAuctionParticipantIds(auction: Auction): Promise<string[]> {
    const participantIds = new Set<string>();
    participantIds.add(auction.sellerId);
    for (const bid of auction.bids) {
      participantIds.add(bid.bidderId);
    }
    return Array.from(participantIds);
  }

  private calculateTax(totalPrice: number, taxRate: number): number {
    return Math.floor(totalPrice * taxRate);
  }

  private calculateSellerReceive(totalPrice: number, taxRate: number): number {
    return totalPrice - this.calculateTax(totalPrice, taxRate);
  }

  async settleAuction(
    gameId: string,
    game: GameState,
    auction: Auction
  ): Promise<{ game: GameState; result: AuctionSettlementResult }> {
    const auctions = await this.getAuctions(gameId);
    const auctionIndex = auctions.findIndex(a => a.id === auction.id);
    if (auctionIndex === -1) {
      return {
        game,
        result: {
          auctionId: auction.id,
          success: false,
          winnerId: null,
          winnerName: null,
          finalPrice: null,
          taxAmount: 0,
          sellerReceive: 0,
          reason: '拍卖不存在'
        }
      };
    }

    const storedAuction = auctions[auctionIndex];
    const activeBids = this.getActiveBids(storedAuction);

    if (activeBids.length === 0) {
      const seller = game.players[storedAuction.sellerId];
      if (seller) {
        seller.ownedSeeds[storedAuction.speciesId] =
          (seller.ownedSeeds[storedAuction.speciesId] || 0) + storedAuction.quantity;
      }

      storedAuction.status = AuctionStatus.FAILED;
      storedAuction.settledAtTurn = game.turn;
      await this.saveAuctions(gameId, auctions);

      return {
        game,
        result: {
          auctionId: storedAuction.id,
          success: false,
          winnerId: null,
          winnerName: null,
          finalPrice: null,
          taxAmount: 0,
          sellerReceive: 0,
          reason: '无人出价，种子已退回卖家'
        }
      };
    }

    const taxRate = game.tradeTaxRate ?? this.DEFAULT_TAX_RATE;

    const playerHighestBid = new Map<string, AuctionBid>();
    for (const bid of activeBids) {
      const existing = playerHighestBid.get(bid.bidderId);
      if (!existing || bid.amount > existing.amount) {
        playerHighestBid.set(bid.bidderId, bid);
      }
    }

    const sortedUniqueBids = [...playerHighestBid.values()].sort((a, b) => b.amount - a.amount);

    let winner: PlayerState | null = null;
    let winningBid: AuctionBid | null = null;
    let finalPrice = 0;
    let taxAmount = 0;
    let sellerReceive = 0;

    for (const bid of sortedUniqueBids) {
      const bidder = game.players[bid.bidderId];
      if (!bidder || bidder.isBankrupt) continue;
      if (bidder.money < bid.amount) continue;

      winner = bidder;
      winningBid = bid;
      finalPrice = bid.amount;
      taxAmount = this.calculateTax(finalPrice, taxRate);
      sellerReceive = this.calculateSellerReceive(finalPrice, taxRate);
      break;
    }

    const seller = game.players[storedAuction.sellerId];

    if (!winner || !winningBid) {
      if (seller) {
        seller.ownedSeeds[storedAuction.speciesId] =
          (seller.ownedSeeds[storedAuction.speciesId] || 0) + storedAuction.quantity;
      }

      storedAuction.status = AuctionStatus.FAILED;
      storedAuction.settledAtTurn = game.turn;
      await this.saveAuctions(gameId, auctions);

      return {
        game,
        result: {
          auctionId: storedAuction.id,
          success: false,
          winnerId: null,
          winnerName: null,
          finalPrice: null,
          taxAmount: 0,
          sellerReceive: 0,
          reason: '所有出价者余额均不足，拍卖流拍，种子退回卖家'
        }
      };
    }

    winner.money -= finalPrice;
    if (seller) {
      seller.money += sellerReceive;
    }
    game.publicFunds = (game.publicFunds || 0) + taxAmount;

    winner.ownedSeeds[storedAuction.speciesId] =
      (winner.ownedSeeds[storedAuction.speciesId] || 0) + storedAuction.quantity;

    if (!winner.discoveredSpecies.includes(storedAuction.speciesId)) {
      winner.discoveredSpecies.push(storedAuction.speciesId);
    }

    storedAuction.status = AuctionStatus.SETTLED;
    storedAuction.winnerId = winner.id;
    storedAuction.winnerName = winner.name;
    storedAuction.finalPrice = finalPrice;
    storedAuction.settledAtTurn = game.turn;
    await this.saveAuctions(gameId, auctions);

    void this.tradeService.addTradeRecord(gameId, {
      speciesId: storedAuction.speciesId,
      sellerId: storedAuction.sellerId,
      buyerId: winner.id,
      unitPrice: Math.floor(finalPrice / storedAuction.quantity),
      quantity: storedAuction.quantity,
      totalPrice: finalPrice,
      taxAmount,
      turn: game.turn
    });

    return {
      game,
      result: {
        auctionId: storedAuction.id,
        success: true,
        winnerId: winner.id,
        winnerName: winner.name,
        finalPrice,
        taxAmount,
        sellerReceive,
        reason: `拍卖成功！${winner.name} 以 ${finalPrice} 金币竞得`
      }
    };
  }

  async processTurnExpiry(
    gameId: string,
    game: GameState
  ): Promise<{
    game: GameState;
    settledResults: AuctionSettlementResult[];
    expiredAuctions: Auction[];
  }> {
    const auctions = await this.getAuctions(gameId);
    const settledResults: AuctionSettlementResult[] = [];
    const expiredAuctions: Auction[] = [];
    const expiredAuctionIds: string[] = [];

    const activeAuctions = auctions.filter(a => a.status === AuctionStatus.ACTIVE);

    for (const auction of activeAuctions) {
      auction.turnsLeft--;

      if (auction.turnsLeft <= 0) {
        expiredAuctions.push(auction);
        expiredAuctionIds.push(auction.id);
      }
    }

    await this.saveAuctions(gameId, auctions);

    for (const expiredAuction of expiredAuctions) {
      const settleResult = await this.settleAuction(gameId, game, expiredAuction);
      game = settleResult.game;
      settledResults.push(settleResult.result);
    }

    return { game, settledResults, expiredAuctions };
  }

  getPlayerAuctions(gameId: string, playerId: string): Promise<Auction[]> {
    return this.getAuctions(gameId).then(auctions =>
      auctions.filter(a => a.sellerId === playerId)
    );
  }

  getPlayerParticipatedAuctions(gameId: string, playerId: string): Promise<Auction[]> {
    return this.getAuctions(gameId).then(auctions =>
      auctions.filter(a =>
        a.bids.some(b => b.bidderId === playerId) || a.sellerId === playerId
      )
    );
  }

  getActiveAuctions(gameId: string): Promise<Auction[]> {
    return this.getAuctions(gameId).then(auctions =>
      auctions.filter(a => a.status === AuctionStatus.ACTIVE)
    );
  }

  getSettledAuctions(gameId: string, speciesId?: string): Promise<Auction[]> {
    return this.getAuctions(gameId).then(auctions => {
      let settled = auctions.filter(a =>
        a.status === AuctionStatus.SETTLED || a.status === AuctionStatus.FAILED
      );
      if (speciesId) {
        settled = settled.filter(a => a.speciesId === speciesId);
      }
      settled.sort((a, b) => (b.settledAtTurn || 0) - (a.settledAtTurn || 0));
      return settled.slice(0, this.HISTORY_LIMIT);
    });
  }

  getParticipantCount(auction: Auction): number {
    const activeBids = this.getActiveBids(auction);
    const bidderIds = new Set(activeBids.map(b => b.bidderId));
    return bidderIds.size;
  }

  getMyProxyBid(auction: Auction, playerId: string): ProxyBid | undefined {
    return auction.proxyBids.find(p => p.bidderId === playerId);
  }

  getWithdrawCount(auction: Auction, playerId: string): number {
    return auction.withdrawCount[playerId] || 0;
  }

  canWithdraw(auction: Auction, playerId: string): boolean {
    if (auction.status !== AuctionStatus.ACTIVE) return false;

    const withdrawCount = this.getWithdrawCount(auction, playerId);
    if (withdrawCount >= this.MAX_WITHDRAW_PER_AUCTION) return false;

    const myActiveBids = this.getPlayerActiveBids(auction, playerId);
    if (myActiveBids.length === 0) return false;

    const allActiveBids = this.getActiveBids(auction);
    const otherActiveBids = allActiveBids.filter(b => b.bidderId !== playerId);
    if (otherActiveBids.length === 0) return false;

    return true;
  }
}
