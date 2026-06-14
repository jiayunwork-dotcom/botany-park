import { Injectable } from '@nestjs/common';
import {
  Auction,
  AuctionBid,
  AuctionStatus,
  AuctionSettlementResult,
  GameState,
  PlayerState,
  MarketOrder,
  MarketOrderStatus
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
    totalTurns: number
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
      settledAtTurn: null
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

  async getPlayerTotalCommittedBids(
    gameId: string,
    playerId: string
  ): Promise<number> {
    const auctions = await this.getAuctions(gameId);
    let total = 0;

    for (const auction of auctions) {
      if (auction.status !== AuctionStatus.ACTIVE) continue;
      if (auction.currentHighBidderId === playerId) {
        total += auction.currentHighBid;
      }
    }

    return total;
  }

  async placeBid(
    gameId: string,
    game: GameState,
    auctionId: string,
    bidderId: string,
    bidAmount: number
  ): Promise<{ auction: Auction; bid: AuctionBid } | { error: string }> {
    const auctions = await this.getAuctions(gameId);
    const auctionIndex = auctions.findIndex(a => a.id === auctionId);

    if (auctionIndex === -1) return { error: '拍卖不存在' };

    const auction = auctions[auctionIndex];
    if (auction.status !== AuctionStatus.ACTIVE) return { error: '拍卖已结束或已取消' };
    if (auction.sellerId === bidderId) return { error: '不能对自己发起的拍卖出价' };

    const bidder = game.players[bidderId];
    if (!bidder) return { error: '玩家不存在' };
    if (bidder.isBankrupt) return { error: '破产玩家无法参与竞价' };

    const minRequiredBid = auction.currentHighBid + auction.minIncrement;
    if (bidAmount < minRequiredBid) {
      return { error: `出价必须至少为 ${minRequiredBid} 金币（当前最高价 + 最低加价）` };
    }

    const playerCommitted = await this.getPlayerTotalCommittedBids(gameId, bidderId);
    let newCommitted = playerCommitted;
    if (auction.currentHighBidderId === bidderId) {
      newCommitted = playerCommitted - auction.currentHighBid + bidAmount;
    } else {
      newCommitted = playerCommitted + bidAmount;
    }

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
      createdAtTurn: game.turn
    };

    auction.bids.push(bid);
    auction.currentHighBid = bidAmount;
    auction.currentHighBidderId = bidderId;
    auction.currentHighBidderName = bidder.name;

    await this.saveAuctions(gameId, auctions);

    return { auction, bid };
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

    if (storedAuction.bids.length === 0) {
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
    const sortedBids = [...storedAuction.bids].sort((a, b) => b.amount - a.amount);

    let winner: PlayerState | null = null;
    let winningBid: AuctionBid | null = null;
    let finalPrice = 0;
    let taxAmount = 0;
    let sellerReceive = 0;

    for (const bid of sortedBids) {
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

    const activeAuctions = auctions.filter(a => a.status === AuctionStatus.ACTIVE);

    for (const auction of activeAuctions) {
      auction.turnsLeft--;

      if (auction.turnsLeft <= 0) {
        expiredAuctions.push(auction);
        const settleResult = await this.settleAuction(gameId, game, auction);
        game = settleResult.game;
        settledResults.push(settleResult.result);
      }
    }

    const currentAuctions = await this.getAuctions(gameId);
    await this.saveAuctions(gameId, currentAuctions);

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

  getParticipantCount(auction: Auction): number {
    const bidderIds = new Set(auction.bids.map(b => b.bidderId));
    return bidderIds.size;
  }
}
