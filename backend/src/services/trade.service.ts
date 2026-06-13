import { Injectable } from '@nestjs/common';
import { MarketOrder, MarketOrderStatus, GameState, PlayerState } from '../types/game.types';
import { RedisService } from './redis.service';
import { getPlantById, PLANT_DATABASE } from '../data/plants.data';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TradeService {
  private readonly MARKET_KEY_PREFIX = 'market:';
  private readonly MAX_ORDER_TURNS = 3;
  private readonly MIN_PRICE_RATIO = 0.3;
  private readonly MAX_PRICE_RATIO = 3.0;

  constructor(private readonly redis: RedisService) {}

  private getMarketKey(gameId: string): string {
    return `${this.MARKET_KEY_PREFIX}${gameId}`;
  }

  async getMarketOrders(gameId: string): Promise<MarketOrder[]> {
    const orders = await this.redis.getJSON<MarketOrder[]>(this.getMarketKey(gameId));
    return orders || [];
  }

  async saveMarketOrders(gameId: string, orders: MarketOrder[]): Promise<void> {
    await this.redis.setJSON(this.getMarketKey(gameId), orders);
  }

  async clearMarket(gameId: string): Promise<void> {
    await this.redis.del(this.getMarketKey(gameId));
  }

  getPriceLimits(speciesId: string): { minPrice: number; maxPrice: number } {
    const species = getPlantById(speciesId);
    const basePrice = species?.price || 50;
    return {
      minPrice: Math.floor(basePrice * this.MIN_PRICE_RATIO),
      maxPrice: Math.floor(basePrice * this.MAX_PRICE_RATIO)
    };
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
      status: MarketOrderStatus.ACTIVE
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

  async buyOrder(
    gameId: string,
    game: GameState,
    orderId: string,
    buyerId: string
  ): Promise<{ game: GameState; order: MarketOrder } | { error: string }> {
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

    buyer.money -= totalCost;
    seller.money += totalCost;

    buyer.ownedSeeds[order.speciesId] = (buyer.ownedSeeds[order.speciesId] || 0) + order.quantity;

    if (!buyer.discoveredSpecies.includes(order.speciesId)) {
      buyer.discoveredSpecies.push(order.speciesId);
    }

    order.status = MarketOrderStatus.SOLD;
    await this.saveMarketOrders(gameId, orders);

    return { game, order };
  }

  async processTurnExpiry(gameId: string, game: GameState): Promise<{
    game: GameState;
    expiredOrders: MarketOrder[];
  }> {
    const orders = await this.getMarketOrders(gameId);
    const expiredOrders: MarketOrder[] = [];

    for (const order of orders) {
      if (order.status !== MarketOrderStatus.ACTIVE) continue;

      order.turnsLeft--;

      if (order.turnsLeft <= 0) {
        order.status = MarketOrderStatus.EXPIRED;
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

  getPlayerOrders(gameId: string, playerId: string): Promise<MarketOrder[]> {
    return this.getMarketOrders(gameId).then(orders =>
      orders.filter(o => o.sellerId === playerId)
    );
  }
}
