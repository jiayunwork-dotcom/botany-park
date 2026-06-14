import { Injectable } from '@nestjs/common';
import {
  MarketOrder,
  MarketOrderStatus,
  GameState,
  PlayerState,
  TradeHistoryRecord,
  MarketSpeciesStats,
  MarketPricePoint,
  Negotiation,
  NegotiationStatus
} from '../types/game.types';
import { RedisService } from './redis.service';
import { getPlantById, PLANT_DATABASE } from '../data/plants.data';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TradeService {
  private readonly MARKET_KEY_PREFIX = 'market:';
  private readonly HISTORY_KEY_PREFIX = 'trade_history:';
  private readonly MAX_ORDER_TURNS = 3;
  private readonly MIN_PRICE_RATIO = 0.3;
  private readonly MAX_PRICE_RATIO = 3.0;
  private readonly PRICE_HISTORY_TURNS = 5;
  private readonly NEGOTIATION_TIMEOUT_MS = 10000;
  private readonly DEFAULT_TAX_RATE = 0.05;

  constructor(private readonly redis: RedisService) {}

  private getMarketKey(gameId: string): string {
    return `${this.MARKET_KEY_PREFIX}${gameId}`;
  }

  private getHistoryKey(gameId: string): string {
    return `${this.HISTORY_KEY_PREFIX}${gameId}`;
  }

  async getMarketOrders(gameId: string): Promise<MarketOrder[]> {
    await this.cleanExpiredNegotiations(gameId);
    const orders = await this.redis.getJSON<MarketOrder[]>(this.getMarketKey(gameId));
    return orders || [];
  }

  async saveMarketOrders(gameId: string, orders: MarketOrder[]): Promise<void> {
    await this.redis.setJSON(this.getMarketKey(gameId), orders);
  }

  async getTradeHistory(gameId: string): Promise<TradeHistoryRecord[]> {
    const history = await this.redis.getJSON<TradeHistoryRecord[]>(this.getHistoryKey(gameId));
    return history || [];
  }

  async saveTradeHistory(gameId: string, history: TradeHistoryRecord[]): Promise<void> {
    await this.redis.setJSON(this.getHistoryKey(gameId), history);
  }

  async addTradeRecord(
    gameId: string,
    record: Omit<TradeHistoryRecord, 'id' | 'timestamp'>
  ): Promise<string> {
    const history = await this.getTradeHistory(gameId);
    const newRecord: TradeHistoryRecord = {
      ...record,
      id: uuidv4(),
      timestamp: Date.now()
    };
    history.push(newRecord);
    await this.saveTradeHistory(gameId, history);
    return newRecord.id;
  }

  async removeTradeRecords(gameId: string, recordIds: string[]): Promise<void> {
    if (recordIds.length === 0) return;
    const history = await this.getTradeHistory(gameId);
    const filteredHistory = history.filter(r => !recordIds.includes(r.id));
    await this.saveTradeHistory(gameId, filteredHistory);
  }

  async clearMarket(gameId: string): Promise<void> {
    await this.redis.del(this.getMarketKey(gameId));
    await this.redis.del(this.getHistoryKey(gameId));
  }

  getPriceLimits(speciesId: string): { minPrice: number; maxPrice: number } {
    const species = getPlantById(speciesId);
    const basePrice = species?.price || 50;
    return {
      minPrice: Math.floor(basePrice * this.MIN_PRICE_RATIO),
      maxPrice: Math.floor(basePrice * this.MAX_PRICE_RATIO)
    };
  }

  async getMarketStats(gameId: string, game: GameState): Promise<MarketSpeciesStats[]> {
    const history = await this.getTradeHistory(gameId);
    const currentTurn = game.turn;
    const minTurn = Math.max(1, currentTurn - this.PRICE_HISTORY_TURNS + 1);

    const speciesMap = new Map<string, { totalPrice: number; totalVolume: number; count: number }>();
    const turnData = new Map<string, Map<number, { totalPrice: number; volume: number; count: number }>>();

    for (const record of history) {
      if (record.turn < minTurn || record.turn > currentTurn) continue;

      if (!speciesMap.has(record.speciesId)) {
        speciesMap.set(record.speciesId, { totalPrice: 0, totalVolume: 0, count: 0 });
        turnData.set(record.speciesId, new Map());
      }

      const speciesData = speciesMap.get(record.speciesId)!;
      speciesData.totalPrice += record.unitPrice * record.quantity;
      speciesData.totalVolume += record.quantity;
      speciesData.count += 1;

      const turnMap = turnData.get(record.speciesId)!;
      if (!turnMap.has(record.turn)) {
        turnMap.set(record.turn, { totalPrice: 0, volume: 0, count: 0 });
      }
      const turnStats = turnMap.get(record.turn)!;
      turnStats.totalPrice += record.unitPrice * record.quantity;
      turnStats.volume += record.quantity;
      turnStats.count += 1;
    }

    const stats: MarketSpeciesStats[] = [];
    for (const [speciesId, data] of speciesMap.entries()) {
      const priceHistory: MarketPricePoint[] = [];
      const turnMap = turnData.get(speciesId) || new Map();

      for (let t = minTurn; t <= currentTurn; t++) {
        const turnStats = turnMap.get(t);
        if (turnStats && turnStats.volume > 0) {
          priceHistory.push({
            turn: t,
            avgPrice: Math.floor(turnStats.totalPrice / turnStats.volume),
            volume: turnStats.volume
          });
        } else {
          priceHistory.push({
            turn: t,
            avgPrice: 0,
            volume: 0
          });
        }
      }

      stats.push({
        speciesId,
        avgPrice5Turns: data.totalVolume > 0 ? Math.floor(data.totalPrice / data.totalVolume) : 0,
        volume5Turns: data.totalVolume,
        priceHistory
      });
    }

    return stats.sort((a, b) => b.volume5Turns - a.volume5Turns);
  }

  async createOrder(
    gameId: string,
    game: GameState,
    sellerId: string,
    speciesId: string,
    quantity: number,
    unitPrice: number
  ): Promise<{ order: MarketOrder; game: GameState } | { error: string }> {
    const seller = game.players[sellerId];
    if (!seller) return { error: '玩家不存在' };
    if (seller.isBankrupt) return { error: '破产玩家无法交易' };

    const owned = seller.ownedSeeds[speciesId] || 0;
    if (owned < quantity) return { error: '种子数量不足' };

    const { minPrice, maxPrice } = this.getPriceLimits(speciesId);
    if (unitPrice < minPrice) {
      const species = getPlantById(speciesId);
      return { error: `单价不能低于 ${minPrice} 金币（原价的30%）` };
    }
    if (unitPrice > maxPrice) {
      const species = getPlantById(speciesId);
      return { error: `单价不能高于 ${maxPrice} 金币（原价的300%）` };
    }

    seller.ownedSeeds[speciesId] = owned - quantity;

    const order: MarketOrder = {
      id: uuidv4(),
      sellerId,
      sellerName: seller.name,
      speciesId,
      quantity,
      unitPrice,
      createdAtTurn: game.turn,
      turnsLeft: this.MAX_ORDER_TURNS,
      status: MarketOrderStatus.ACTIVE,
      currentNegotiation: null
    };

    const orders = await this.getMarketOrders(gameId);
    orders.push(order);
    await this.saveMarketOrders(gameId, orders);

    return { order, game };
  }

  async cancelOrder(
    gameId: string,
    game: GameState,
    orderId: string,
    playerId: string
  ): Promise<{ game: GameState; order: MarketOrder } | { error: string }> {
    const orders = await this.getMarketOrders(gameId);
    const orderIndex = orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) return { error: '挂单不存在' };

    const order = orders[orderIndex];
    if (order.sellerId !== playerId) return { error: '只能撤销自己的挂单' };
    if (order.status !== MarketOrderStatus.ACTIVE) return { error: '该挂单已无法撤销' };

    const seller = game.players[order.sellerId];
    if (seller) {
      seller.ownedSeeds[order.speciesId] = (seller.ownedSeeds[order.speciesId] || 0) + order.quantity;
    }

    order.status = MarketOrderStatus.CANCELLED;
    await this.saveMarketOrders(gameId, orders);

    return { game, order };
  }

  private calculateTax(totalPrice: number, taxRate: number): number {
    return Math.floor(totalPrice * taxRate);
  }

  private calculateSellerReceive(totalPrice: number, taxRate: number): number {
    return totalPrice - this.calculateTax(totalPrice, taxRate);
  }

  async buyOrder(
    gameId: string,
    game: GameState,
    orderId: string,
    buyerId: string
  ): Promise<{ game: GameState; order: MarketOrder; taxAmount: number } | { error: string }> {
    const orders = await this.getMarketOrders(gameId);
    const orderIndex = orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) return { error: '挂单不存在或已失效' };

    const order = orders[orderIndex];
    if (order.status !== MarketOrderStatus.ACTIVE) return { error: '挂单已失效' };
    if (order.sellerId === buyerId) return { error: '不能购买自己的挂单' };

    const buyer = game.players[buyerId];
    const seller = game.players[order.sellerId];

    if (!buyer || !seller) return { error: '玩家不存在' };
    if (buyer.isBankrupt) return { error: '破产玩家无法交易' };

    const totalCost = order.unitPrice * order.quantity;
    if (buyer.money < totalCost) return { error: '金币不足' };

    const taxRate = game.tradeTaxRate ?? this.DEFAULT_TAX_RATE;
    const taxAmount = this.calculateTax(totalCost, taxRate);
    const sellerReceive = this.calculateSellerReceive(totalCost, taxRate);

    buyer.money -= totalCost;
    seller.money += sellerReceive;
    game.publicFunds = (game.publicFunds || 0) + taxAmount;

    buyer.ownedSeeds[order.speciesId] = (buyer.ownedSeeds[order.speciesId] || 0) + order.quantity;

    if (!buyer.discoveredSpecies.includes(order.speciesId)) {
      buyer.discoveredSpecies.push(order.speciesId);
    }

    order.status = MarketOrderStatus.SOLD;
    order.currentNegotiation = null;
    await this.saveMarketOrders(gameId, orders);

    void this.addTradeRecord(gameId, {
      speciesId: order.speciesId,
      sellerId: order.sellerId,
      buyerId,
      unitPrice: order.unitPrice,
      quantity: order.quantity,
      totalPrice: totalCost,
      taxAmount,
      turn: game.turn
    });

    return { game, order, taxAmount };
  }

  async buyOrders(
    gameId: string,
    game: GameState,
    orderIds: string[],
    buyerId: string
  ): Promise<{ game: GameState; orders: MarketOrder[]; totalCost: number; totalTax: number } | { error: string }> {
    if (orderIds.length === 0) return { error: '请选择要购买的挂单' };

    await this.cleanExpiredNegotiations(gameId);

    const orders = await this.redis.getJSON<MarketOrder[]>(this.getMarketKey(gameId)) || [];
    const targetOrders: MarketOrder[] = [];

    for (const orderId of orderIds) {
      const order = orders.find(o => o.id === orderId);
      if (!order) return { error: `挂单 ${orderId} 不存在` };
      if (order.status !== MarketOrderStatus.ACTIVE) return { error: `挂单 ${orderId} 已失效` };
      if (order.sellerId === buyerId) return { error: '不能购买自己的挂单' };
      targetOrders.push(order);
    }

    const buyer = game.players[buyerId];
    if (!buyer) return { error: '玩家不存在' };
    if (buyer.isBankrupt) return { error: '破产玩家无法交易' };

    const totalCost = targetOrders.reduce((sum, o) => sum + o.unitPrice * o.quantity, 0);
    if (buyer.money < totalCost) return { error: '金币不足' };

    const taxRate = game.tradeTaxRate ?? this.DEFAULT_TAX_RATE;
    let totalTax = 0;
    const tradeRecordIds: string[] = [];
    const sellerChanges: Map<string, number> = new Map();
    const buyerSeedChanges: Map<string, number> = new Map();
    const buyerDiscoveredNew: string[] = [];
    const originalBuyerMoney = buyer.money;
    const originalPublicFunds = game.publicFunds || 0;
    const executedOrderIds: string[] = [];

    try {
      for (const order of targetOrders) {
        const freshOrders = await this.redis.getJSON<MarketOrder[]>(this.getMarketKey(gameId)) || [];
        const currentOrder = freshOrders.find(o => o.id === order.id);
        if (!currentOrder || currentOrder.status !== MarketOrderStatus.ACTIVE) {
          throw new Error(`挂单 ${order.id} 已被他人购买或失效，交易回滚`);
        }

        const seller = game.players[order.sellerId];
        if (!seller) throw new Error('卖家不存在');

        const orderTotal = order.unitPrice * order.quantity;
        const taxAmount = this.calculateTax(orderTotal, taxRate);
        const sellerReceive = this.calculateSellerReceive(orderTotal, taxRate);

        if (!sellerChanges.has(order.sellerId)) {
          sellerChanges.set(order.sellerId, seller.money);
        }
        seller.money += sellerReceive;
        totalTax += taxAmount;

        if (!buyerSeedChanges.has(order.speciesId)) {
          buyerSeedChanges.set(order.speciesId, buyer.ownedSeeds[order.speciesId] || 0);
        }
        buyer.ownedSeeds[order.speciesId] = (buyer.ownedSeeds[order.speciesId] || 0) + order.quantity;

        const wasDiscovered = buyer.discoveredSpecies.includes(order.speciesId);
        if (!wasDiscovered) {
          buyer.discoveredSpecies.push(order.speciesId);
          buyerDiscoveredNew.push(order.speciesId);
        }

        const orderInList = orders.find(o => o.id === order.id);
        if (orderInList) {
          orderInList.status = MarketOrderStatus.SOLD;
          orderInList.currentNegotiation = null;
        }

        const recordId = await this.addTradeRecord(gameId, {
          speciesId: order.speciesId,
          sellerId: order.sellerId,
          buyerId,
          unitPrice: order.unitPrice,
          quantity: order.quantity,
          totalPrice: orderTotal,
          taxAmount,
          turn: game.turn
        });
        tradeRecordIds.push(recordId);
        executedOrderIds.push(order.id);
      }

      buyer.money -= totalCost;
      game.publicFunds = originalPublicFunds + totalTax;

      await this.saveMarketOrders(gameId, orders);

      return { game, orders: targetOrders, totalCost, totalTax };
    } catch (e) {
      for (const [sellerId, originalMoney] of sellerChanges.entries()) {
        const seller = game.players[sellerId];
        if (seller) {
          seller.money = originalMoney;
        }
      }

      for (const [speciesId, originalCount] of buyerSeedChanges.entries()) {
        buyer.ownedSeeds[speciesId] = originalCount;
      }

      for (const speciesId of buyerDiscoveredNew) {
        const idx = buyer.discoveredSpecies.indexOf(speciesId);
        if (idx > -1) {
          buyer.discoveredSpecies.splice(idx, 1);
        }
      }

      buyer.money = originalBuyerMoney;
      game.publicFunds = originalPublicFunds;

      if (tradeRecordIds.length > 0) {
        await this.removeTradeRecords(gameId, tradeRecordIds);
      }

      const originalOrders = JSON.parse(JSON.stringify(
        await this.redis.getJSON<MarketOrder[]>(this.getMarketKey(gameId)) || []
      ));
      for (let i = 0; i < originalOrders.length; i++) {
        const originalOrder = originalOrders[i];
        if (executedOrderIds.includes(originalOrder.id)) {
          originalOrder.status = MarketOrderStatus.ACTIVE;
          originalOrder.currentNegotiation = null;
        }
      }
      await this.saveMarketOrders(gameId, originalOrders);

      return { error: e.message || '批量购买失败，交易已回滚' };
    }
  }

  async negotiatePrice(
    gameId: string,
    game: GameState,
    orderId: string,
    buyerId: string,
    offerPrice: number
  ): Promise<{ negotiation: Negotiation; order: MarketOrder } | { error: string }> {
    const orders = await this.getMarketOrders(gameId);
    const orderIndex = orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) return { error: '挂单不存在' };

    const order = orders[orderIndex];
    if (order.status !== MarketOrderStatus.ACTIVE) return { error: '挂单已失效' };
    if (order.sellerId === buyerId) return { error: '不能对自己的挂单议价' };

    if (order.currentNegotiation && order.currentNegotiation.status === NegotiationStatus.PENDING) {
      if (order.currentNegotiation.expiresAt > Date.now()) {
        return { error: '该挂单正在议价中，请稍后再试' };
      }
    }

    const buyer = game.players[buyerId];
    if (!buyer || buyer.isBankrupt) return { error: '玩家不存在或已破产' };

    const { minPrice } = this.getPriceLimits(order.speciesId);
    if (offerPrice < minPrice) {
      return { error: `出价不能低于 ${minPrice} 金币（原价的30%）` };
    }
    if (offerPrice >= order.unitPrice) {
      return { error: '议价必须低于挂单价' };
    }

    const totalCost = offerPrice * order.quantity;
    if (buyer.money < totalCost) return { error: '金币不足以支付此出价' };

    const now = Date.now();
    const negotiation: Negotiation = {
      id: uuidv4(),
      orderId: order.id,
      buyerId,
      buyerName: buyer.name,
      offerPrice,
      status: NegotiationStatus.PENDING,
      createdAt: now,
      expiresAt: now + this.NEGOTIATION_TIMEOUT_MS
    };

    order.currentNegotiation = negotiation;
    order.status = MarketOrderStatus.NEGOTIATING;

    await this.saveMarketOrders(gameId, orders);

    return { negotiation, order };
  }

  async respondNegotiation(
    gameId: string,
    game: GameState,
    orderId: string,
    sellerId: string,
    accept: boolean
  ): Promise<{
    accepted: boolean;
    order?: MarketOrder;
    negotiation?: Negotiation;
    taxAmount?: number;
  } | { error: string }> {
    const orders = await this.getMarketOrders(gameId);
    const orderIndex = orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) return { error: '挂单不存在' };

    const order = orders[orderIndex];
    if (order.sellerId !== sellerId) return { error: '只能回应自己挂单的议价' };

    const negotiation = order.currentNegotiation;
    if (!negotiation) return { error: '没有进行中的议价' };
    if (negotiation.status !== NegotiationStatus.PENDING) return { error: '议价已处理' };

    if (negotiation.expiresAt <= Date.now()) {
      negotiation.status = NegotiationStatus.EXPIRED;
      order.status = MarketOrderStatus.ACTIVE;
      order.currentNegotiation = null;
      await this.saveMarketOrders(gameId, orders);
      return { error: '议价已超时' };
    }

    if (!accept) {
      negotiation.status = NegotiationStatus.REJECTED;
      order.status = MarketOrderStatus.ACTIVE;
      order.currentNegotiation = null;
      await this.saveMarketOrders(gameId, orders);
      return { accepted: false, negotiation };
    }

    const buyer = game.players[negotiation.buyerId];
    const seller = game.players[sellerId];

    if (!buyer || !seller) return { error: '玩家不存在' };
    if (buyer.isBankrupt) return { error: '买家已破产' };

    const totalCost = negotiation.offerPrice * order.quantity;
    if (buyer.money < totalCost) {
      negotiation.status = NegotiationStatus.REJECTED;
      order.status = MarketOrderStatus.ACTIVE;
      order.currentNegotiation = null;
      await this.saveMarketOrders(gameId, orders);
      return { error: '买家金币不足' };
    }

    const taxRate = game.tradeTaxRate ?? this.DEFAULT_TAX_RATE;
    const taxAmount = this.calculateTax(totalCost, taxRate);
    const sellerReceive = this.calculateSellerReceive(totalCost, taxRate);

    buyer.money -= totalCost;
    seller.money += sellerReceive;
    game.publicFunds = (game.publicFunds || 0) + taxAmount;

    buyer.ownedSeeds[order.speciesId] = (buyer.ownedSeeds[order.speciesId] || 0) + order.quantity;

    if (!buyer.discoveredSpecies.includes(order.speciesId)) {
      buyer.discoveredSpecies.push(order.speciesId);
    }

    negotiation.status = NegotiationStatus.ACCEPTED;
    order.status = MarketOrderStatus.SOLD;
    order.currentNegotiation = null;

    await this.saveMarketOrders(gameId, orders);

    void this.addTradeRecord(gameId, {
      speciesId: order.speciesId,
      sellerId,
      buyerId: buyer.id,
      unitPrice: negotiation.offerPrice,
      quantity: order.quantity,
      totalPrice: totalCost,
      taxAmount,
      turn: game.turn
    });

    return { accepted: true, order, negotiation, taxAmount };
  }

  async cleanExpiredNegotiations(gameId: string): Promise<{ expiredCount: number }> {
    const orders = await this.redis.getJSON<MarketOrder[]>(this.getMarketKey(gameId)) || [];
    let expiredCount = 0;
    const now = Date.now();

    for (const order of orders) {
      if (
        order.currentNegotiation &&
        order.currentNegotiation.status === NegotiationStatus.PENDING &&
        order.currentNegotiation.expiresAt <= now
      ) {
        order.currentNegotiation.status = NegotiationStatus.EXPIRED;
        order.status = MarketOrderStatus.ACTIVE;
        order.currentNegotiation = null;
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      await this.saveMarketOrders(gameId, orders);
    }

    return { expiredCount };
  }

  async processTurnExpiry(gameId: string, game: GameState): Promise<{
    game: GameState;
    expiredOrders: MarketOrder[];
  }> {
    const orders = await this.getMarketOrders(gameId);
    const expiredOrders: MarketOrder[] = [];

    for (const order of orders) {
      if (order.status === MarketOrderStatus.SOLD || order.status === MarketOrderStatus.CANCELLED) continue;

      order.turnsLeft--;

      if (order.turnsLeft <= 0) {
        order.status = MarketOrderStatus.EXPIRED;
        order.currentNegotiation = null;
        expiredOrders.push(order);

        const seller = game.players[order.sellerId];
        if (seller) {
          seller.ownedSeeds[order.speciesId] = (seller.ownedSeeds[order.speciesId] || 0) + order.quantity;
        }
      }
    }

    await this.saveMarketOrders(gameId, orders);

    return { game, expiredOrders };
  }

  distributeMarketDividend(game: GameState): { game: GameState; dividendPerPlayer: number; events: string[] } {
    const events: string[] = [];
    const publicFunds = game.publicFunds || 0;

    if (publicFunds <= 0) {
      return { game, dividendPerPlayer: 0, events };
    }

    const activePlayers = Object.values(game.players).filter(p => !p.isBankrupt);
    if (activePlayers.length === 0) {
      return { game, dividendPerPlayer: 0, events };
    }

    const dividendPerPlayer = Math.floor(publicFunds / activePlayers.length);

    if (dividendPerPlayer > 0) {
      for (const player of activePlayers) {
        player.money += dividendPerPlayer;
        events.push(`${player.name} 获得市场红利 ${dividendPerPlayer} 金币`);
      }
      game.publicFunds = 0;
    }

    return { game, dividendPerPlayer, events };
  }

  getPlayerOrders(gameId: string, playerId: string): Promise<MarketOrder[]> {
    return this.getMarketOrders(gameId).then(orders =>
      orders.filter(o => o.sellerId === playerId)
    );
  }
}
