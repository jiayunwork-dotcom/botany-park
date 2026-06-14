import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameStateService } from '../services/game-state.service';
import { GameEngineService } from '../services/game-engine.service';
import { TradeService } from '../services/trade.service';
import { AuctionService } from '../services/auction.service';
import { PlayerAction, GamePhase, MarketOrder, MarketSpeciesStats, Negotiation, Auction, AuctionBid, AuctionSettlementResult } from '../types/game.types';
import { v4 as uuidv4 } from 'uuid';

interface ClientMap {
  [socketId: string]: {
    playerId: string;
    gameId: string | null;
  };
}

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  namespace: '/game'
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private clients: ClientMap = {};

  constructor(
    private readonly gameState: GameStateService,
    private readonly gameEngine: GameEngineService,
    private readonly tradeService: TradeService,
    private readonly auctionService: AuctionService
  ) {}

  handleConnection(client: Socket) {
    const playerId = uuidv4();
    this.clients[client.id] = { playerId, gameId: null };
    client.emit('connected', { playerId, socketId: client.id });
  }

  async handleDisconnect(client: Socket) {
    const clientInfo = this.clients[client.id];
    if (clientInfo && clientInfo.gameId) {
      const game = await this.gameState.getGame(clientInfo.gameId);
      if (game && game.phase === GamePhase.WAITING) {
        const updatedGame = await this.gameState.removePlayer(clientInfo.gameId, clientInfo.playerId);
        if (updatedGame) {
          this.broadcastGameState(clientInfo.gameId, updatedGame);
        }
      }
    }
    delete this.clients[client.id];
  }

  @SubscribeMessage('create_game')
  async handleCreateGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { playerName: string }
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo) return;

    const game = await this.gameState.createGame(
      clientInfo.playerId,
      data.playerName,
      client.id
    );
    clientInfo.gameId = game.id;

    client.join(game.id);
    client.emit('game_created', { gameId: game.id, playerId: clientInfo.playerId });
    this.broadcastGameState(game.id, game);
  }

  @SubscribeMessage('join_game')
  async handleJoinGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { gameId: string; playerName: string }
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo) return;

    const game = await this.gameState.addPlayer(
      data.gameId,
      clientInfo.playerId,
      data.playerName,
      client.id
    );

    if (!game) {
      client.emit('error', { message: '无法加入游戏' });
      return;
    }

    clientInfo.gameId = game.id;
    client.join(game.id);
    client.emit('game_joined', { gameId: game.id, playerId: clientInfo.playerId });
    this.broadcastGameState(game.id, game);
  }

  @SubscribeMessage('start_game')
  async handleStartGame(
    @ConnectedSocket() client: Socket
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const game = await this.gameState.getGame(clientInfo.gameId);
    if (!game || game.hostId !== clientInfo.playerId) {
      client.emit('error', { message: '仅房主可开始游戏' });
      return;
    }

    const startedGame = await this.gameState.startGame(clientInfo.gameId);
    if (startedGame) {
      this.broadcastGameState(startedGame.id, startedGame);
      this.server.to(startedGame.id).emit('game_started', { turn: startedGame.turn });
    }
  }

  @SubscribeMessage('submit_actions')
  async handleSubmitActions(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { actions: PlayerAction[] }
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const game = await this.gameState.submitActions(
      clientInfo.gameId,
      clientInfo.playerId,
      data.actions
    );

    if (!game) return;

    this.server.to(clientInfo.gameId).emit('player_ready', {
      playerId: clientInfo.playerId,
      playerName: game.players[clientInfo.playerId]?.name
    });

    if (this.gameState.allActionsSubmitted(game)) {
      const result = await this.gameState.processTurn(clientInfo.gameId);
      if (result) {
        const { game: updatedGame, events, randomEvents, weatherForecast, expiredMarketOrders, auctionSettlementResults } = result;
        const leaderboard = this.gameEngine.getLeaderboard(updatedGame);

        this.server.to(updatedGame.id).emit('turn_processed', {
          turn: updatedGame.turn,
          season: updatedGame.season,
          events,
          randomEvents,
          weatherForecast,
          leaderboard,
          expiredMarketOrders,
          auctionSettlementResults
        });

        if (auctionSettlementResults && auctionSettlementResults.length > 0) {
          for (const settlementResult of auctionSettlementResults) {
            this.server.to(updatedGame.id).emit('auction_settled', settlementResult);
          }
        }

        if (updatedGame.phase === GamePhase.FINISHED) {
          this.server.to(updatedGame.id).emit('game_finished', {
            leaderboard
          });
        }

        this.broadcastGameState(updatedGame.id, updatedGame);
        this.broadcastMarketUpdate(updatedGame.id);
        this.broadcastAuctionUpdate(updatedGame.id);
      }
    } else {
      this.broadcastGameState(game.id, game);
    }
  }

  @SubscribeMessage('get_leaderboard')
  async handleGetLeaderboard(
    @ConnectedSocket() client: Socket
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const game = await this.gameState.getGame(clientInfo.gameId);
    if (!game) return;

    const leaderboard = this.gameEngine.getLeaderboard(game);
    client.emit('leaderboard', { leaderboard });
  }

  @SubscribeMessage('get_plants_data')
  async handleGetPlantsData(
    @ConnectedSocket() client: Socket
  ) {
    const { PLANT_DATABASE } = await import('../data/plants.data');
    const { ECOLOGY_INTERACTIONS } = await import('../data/ecology.data');
    client.emit('plants_data', {
      species: PLANT_DATABASE,
      interactions: ECOLOGY_INTERACTIONS
    });
  }

  @SubscribeMessage('buy_seed')
  async handleBuySeed(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { speciesId: string; quantity: number }
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const game = await this.gameState.getGame(clientInfo.gameId);
    if (!game) return;

    const player = game.players[clientInfo.playerId];
    if (!player) return;

    const shop = game.seedShop[clientInfo.playerId] || [];
    const item = shop.find(s => s.speciesId === data.speciesId);
    if (!item || item.stock < data.quantity) {
      client.emit('error', { message: '库存不足' });
      return;
    }

    const totalCost = item.price * data.quantity;
    if (player.money < totalCost) {
      client.emit('error', { message: '资金不足' });
      return;
    }

    player.money -= totalCost;
    item.stock -= data.quantity;
    player.ownedSeeds[data.speciesId] = (player.ownedSeeds[data.speciesId] || 0) + data.quantity;

    if (!player.discoveredSpecies.includes(data.speciesId)) {
      player.discoveredSpecies.push(data.speciesId);
    }

    await this.gameState.saveGame(game);
    client.emit('seed_purchased', { speciesId: data.speciesId, quantity: data.quantity });
    this.broadcastGameState(game.id, game);
  }

  @SubscribeMessage('get_market')
  async handleGetMarket(
    @ConnectedSocket() client: Socket
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const game = await this.gameState.getGame(clientInfo.gameId);
    if (!game) return;

    const orders = await this.tradeService.getMarketOrders(clientInfo.gameId);
    const stats = await this.tradeService.getMarketStats(clientInfo.gameId, game);

    client.emit('market_update', {
      orders,
      stats,
      publicFunds: game.publicFunds || 0,
      taxRate: game.tradeTaxRate || 0.05
    });
  }

  @SubscribeMessage('create_order')
  async handleCreateOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { speciesId: string; quantity: number; unitPrice: number }
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const game = await this.gameState.getGame(clientInfo.gameId);
    if (!game || game.phase !== GamePhase.PLAYING) {
      client.emit('error', { message: '游戏未开始' });
      return;
    }

    const result = await this.tradeService.createOrder(
      clientInfo.gameId,
      game,
      clientInfo.playerId,
      data.speciesId,
      data.quantity,
      data.unitPrice
    );

    if ('error' in result) {
      client.emit('error', { message: result.error });
      return;
    }

    await this.gameState.saveGame(result.game);
    client.emit('order_created', { order: result.order });
    this.broadcastMarketUpdate(clientInfo.gameId);
    this.broadcastGameState(game.id, result.game);
  }

  @SubscribeMessage('cancel_order')
  async handleCancelOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string }
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const game = await this.gameState.getGame(clientInfo.gameId);
    if (!game) return;

    const result = await this.tradeService.cancelOrder(
      clientInfo.gameId,
      game,
      data.orderId,
      clientInfo.playerId
    );

    if ('error' in result) {
      client.emit('error', { message: result.error });
      return;
    }

    await this.gameState.saveGame(result.game);
    client.emit('order_cancelled', { order: result.order });
    this.broadcastMarketUpdate(clientInfo.gameId);
    this.broadcastGameState(game.id, result.game);
  }

  @SubscribeMessage('buy_order')
  async handleBuyOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string }
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const game = await this.gameState.getGame(clientInfo.gameId);
    if (!game || game.phase !== GamePhase.PLAYING) {
      client.emit('error', { message: '游戏未开始' });
      return;
    }

    const result = await this.tradeService.buyOrder(
      clientInfo.gameId,
      game,
      data.orderId,
      clientInfo.playerId
    );

    if ('error' in result) {
      client.emit('error', { message: result.error });
      return;
    }

    await this.gameState.saveGame(result.game);
    client.emit('order_bought', { order: result.order, taxAmount: result.taxAmount });

    const sellerSocket = this.findSocketByPlayerId(clientInfo.gameId, result.order.sellerId);
    if (sellerSocket) {
      this.server.to(sellerSocket).emit('order_sold', {
        order: result.order,
        taxAmount: result.taxAmount,
        sellerReceive: result.order.unitPrice * result.order.quantity - result.taxAmount
      });
    }

    this.broadcastMarketUpdate(clientInfo.gameId);
    this.broadcastGameState(game.id, result.game);
  }

  @SubscribeMessage('buy_orders')
  async handleBuyOrders(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderIds: string[] }
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const game = await this.gameState.getGame(clientInfo.gameId);
    if (!game || game.phase !== GamePhase.PLAYING) {
      client.emit('error', { message: '游戏未开始' });
      return;
    }

    const result = await this.tradeService.buyOrders(
      clientInfo.gameId,
      game,
      data.orderIds,
      clientInfo.playerId
    );

    if ('error' in result) {
      client.emit('error', { message: result.error });
      return;
    }

    await this.gameState.saveGame(result.game);
    client.emit('orders_bought', {
      orders: result.orders,
      totalCost: result.totalCost,
      totalTax: result.totalTax
    });

    for (const order of result.orders) {
      const sellerSocket = this.findSocketByPlayerId(clientInfo.gameId, order.sellerId);
      if (sellerSocket) {
        const orderTotal = order.unitPrice * order.quantity;
        const taxAmount = Math.floor(orderTotal * (game.tradeTaxRate || 0.05));
        this.server.to(sellerSocket).emit('order_sold', {
          order,
          taxAmount,
          sellerReceive: orderTotal - taxAmount
        });
      }
    }

    this.broadcastMarketUpdate(clientInfo.gameId);
    this.broadcastGameState(game.id, result.game);
  }

  @SubscribeMessage('negotiate_price')
  async handleNegotiatePrice(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string; offerPrice: number }
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const game = await this.gameState.getGame(clientInfo.gameId);
    if (!game || game.phase !== GamePhase.PLAYING) {
      client.emit('error', { message: '游戏未开始' });
      return;
    }

    const result = await this.tradeService.negotiatePrice(
      clientInfo.gameId,
      game,
      data.orderId,
      clientInfo.playerId,
      data.offerPrice
    );

    if ('error' in result) {
      client.emit('error', { message: result.error });
      return;
    }

    client.emit('negotiation_created', {
      negotiation: result.negotiation,
      order: result.order
    });

    const sellerSocket = this.findSocketByPlayerId(clientInfo.gameId, result.order.sellerId);
    if (sellerSocket) {
      this.server.to(sellerSocket).emit('negotiation_received', {
        negotiation: result.negotiation,
        order: result.order
      });
    }

    this.broadcastMarketUpdate(clientInfo.gameId);
  }

  @SubscribeMessage('respond_negotiate')
  async handleRespondNegotiation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string; accept: boolean }
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const game = await this.gameState.getGame(clientInfo.gameId);
    if (!game || game.phase !== GamePhase.PLAYING) {
      client.emit('error', { message: '游戏未开始' });
      return;
    }

    const result = await this.tradeService.respondNegotiation(
      clientInfo.gameId,
      game,
      data.orderId,
      clientInfo.playerId,
      data.accept
    );

    if ('error' in result) {
      client.emit('error', { message: result.error });
      return;
    }

    if (result.accepted && result.order) {
      await this.gameState.saveGame(game);

      client.emit('negotiation_responded', {
        accepted: true,
        order: result.order,
        negotiation: result.negotiation
      });

      const buyerSocket = this.findSocketByPlayerId(clientInfo.gameId, result.negotiation!.buyerId);
      if (buyerSocket) {
        this.server.to(buyerSocket).emit('negotiation_accepted', {
          order: result.order,
          negotiation: result.negotiation,
          taxAmount: result.taxAmount
        });
      }

      this.broadcastMarketUpdate(clientInfo.gameId);
      this.broadcastGameState(game.id, game);
    } else {
      client.emit('negotiation_responded', {
        accepted: false,
        negotiation: result.negotiation
      });

      const buyerSocket = this.findSocketByPlayerId(clientInfo.gameId, result.negotiation!.buyerId);
      if (buyerSocket) {
        this.server.to(buyerSocket).emit('negotiation_rejected', {
          negotiation: result.negotiation,
          orderId: data.orderId
        });
      }

      this.broadcastMarketUpdate(clientInfo.gameId);
    }
  }

  @SubscribeMessage('get_auctions')
  async handleGetAuctions(
    @ConnectedSocket() client: Socket
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const auctions = await this.auctionService.getAuctions(clientInfo.gameId);
    client.emit('auctions_update', { auctions });
  }

  @SubscribeMessage('create_auction')
  async handleCreateAuction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { speciesId: string; quantity: number; startPrice: number; minIncrement: number; totalTurns: number; buyNowPrice?: number | null }
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const game = await this.gameState.getGame(clientInfo.gameId);
    if (!game || game.phase !== GamePhase.PLAYING) {
      client.emit('error', { message: '游戏未开始' });
      return;
    }

    const result = await this.auctionService.createAuction(
      clientInfo.gameId,
      game,
      clientInfo.playerId,
      data.speciesId,
      data.quantity,
      data.startPrice,
      data.minIncrement,
      data.totalTurns,
      data.buyNowPrice ?? null
    );

    if ('error' in result) {
      client.emit('error', { message: result.error });
      return;
    }

    await this.gameState.saveGame(result.game);
    client.emit('auction_created', { auction: result.auction });
    this.broadcastAuctionUpdate(clientInfo.gameId);
    this.broadcastGameState(game.id, result.game);
  }

  @SubscribeMessage('cancel_auction')
  async handleCancelAuction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { auctionId: string }
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const game = await this.gameState.getGame(clientInfo.gameId);
    if (!game) return;

    const result = await this.auctionService.cancelAuction(
      clientInfo.gameId,
      game,
      data.auctionId,
      clientInfo.playerId
    );

    if ('error' in result) {
      client.emit('error', { message: result.error });
      return;
    }

    await this.gameState.saveGame(result.game);
    client.emit('auction_cancelled', { auction: result.auction });
    this.broadcastAuctionUpdate(clientInfo.gameId);
    this.broadcastGameState(game.id, result.game);
  }

  private async notifyAuctionBid(
    gameId: string,
    auction: Auction,
    bid: AuctionBid,
    excludePlayerId?: string
  ) {
    const participantIds = await this.auctionService.getAuctionParticipantIds(auction);
    for (const pid of participantIds) {
      if (excludePlayerId && pid === excludePlayerId) continue;
      const participantSocket = this.findSocketByPlayerId(gameId, pid);
      if (participantSocket) {
        this.server.to(participantSocket).emit('auction_bid_notification', {
          auctionId: auction.id,
          currentHighBid: auction.currentHighBid,
          bidderName: bid.bidderName,
          speciesId: auction.speciesId,
          quantity: auction.quantity,
          isAuto: bid.isAuto
        });
      }
    }
  }

  private async handleAuctionSettlement(
    gameId: string,
    settlement: AuctionSettlementResult
  ) {
    this.server.to(gameId).emit('auction_settled', settlement);
  }

  @SubscribeMessage('place_bid')
  async handlePlaceBid(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { auctionId: string; bidAmount: number }
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const game = await this.gameState.getGame(clientInfo.gameId);
    if (!game || game.phase !== GamePhase.PLAYING) {
      client.emit('error', { message: '游戏未开始' });
      return;
    }

    const result = await this.auctionService.placeBid(
      clientInfo.gameId,
      game,
      data.auctionId,
      clientInfo.playerId,
      data.bidAmount
    );

    if ('error' in result) {
      client.emit('error', { message: result.error });
      return;
    }

    client.emit('bid_placed', { auction: result.auction, bid: result.bid });

    await this.notifyAuctionBid(clientInfo.gameId, result.auction, result.bid, clientInfo.playerId);

    if (result.autoBids && result.autoBids.length > 0) {
      for (const autoBid of result.autoBids) {
        await this.notifyAuctionBid(clientInfo.gameId, result.auction, autoBid, autoBid.bidderId);
      }
    }

    if (result.settled) {
      await this.gameState.saveGame(game);
      await this.handleAuctionSettlement(clientInfo.gameId, result.settled);
    }

    this.broadcastAuctionUpdate(clientInfo.gameId);
    this.broadcastGameState(game.id, game);
  }

  @SubscribeMessage('withdraw_bid')
  async handleWithdrawBid(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { auctionId: string }
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const result = await this.auctionService.withdrawBid(
      clientInfo.gameId,
      data.auctionId,
      clientInfo.playerId
    );

    if ('error' in result) {
      client.emit('error', { message: result.error });
      return;
    }

    client.emit('bid_withdrawn', { auction: result.auction, bid: result.bid });

    this.broadcastAuctionUpdate(clientInfo.gameId);
  }

  @SubscribeMessage('set_proxy_bid')
  async handleSetProxyBid(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { auctionId: string; maxPrice: number }
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const game = await this.gameState.getGame(clientInfo.gameId);
    if (!game || game.phase !== GamePhase.PLAYING) {
      client.emit('error', { message: '游戏未开始' });
      return;
    }

    const result = await this.auctionService.setProxyBid(
      clientInfo.gameId,
      game,
      data.auctionId,
      clientInfo.playerId,
      data.maxPrice
    );

    if ('error' in result) {
      client.emit('error', { message: result.error });
      return;
    }

    client.emit('proxy_bid_set', {
      auction: result.auction,
      autoBids: result.autoBids
    });

    for (const autoBid of result.autoBids) {
      await this.notifyAuctionBid(clientInfo.gameId, result.auction, autoBid, autoBid.bidderId);
    }

    if (result.settled) {
      await this.gameState.saveGame(game);
      await this.handleAuctionSettlement(clientInfo.gameId, result.settled);
    }

    this.broadcastAuctionUpdate(clientInfo.gameId);
    this.broadcastGameState(game.id, game);
  }

  @SubscribeMessage('get_auction_history')
  async handleGetAuctionHistory(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { speciesId?: string }
  ) {
    const clientInfo = this.clients[client.id];
    if (!clientInfo || !clientInfo.gameId) return;

    const history = await this.auctionService.getSettledAuctions(
      clientInfo.gameId,
      data?.speciesId
    );
    client.emit('auction_history', { history });
  }

  private findSocketByPlayerId(gameId: string, playerId: string): string | null {
    for (const [socketId, info] of Object.entries(this.clients)) {
      if (info.gameId === gameId && info.playerId === playerId) {
        return socketId;
      }
    }
    return null;
  }

  private async broadcastMarketUpdate(gameId: string) {
    const game = await this.gameState.getGame(gameId);
    if (!game) return;

    const orders = await this.tradeService.getMarketOrders(gameId);
    const stats = await this.tradeService.getMarketStats(gameId, game);

    this.server.to(gameId).emit('market_update', {
      orders,
      stats,
      publicFunds: game.publicFunds || 0,
      taxRate: game.tradeTaxRate || 0.05
    });
  }

  private async broadcastAuctionUpdate(gameId: string) {
    const auctions = await this.auctionService.getAuctions(gameId);
    this.server.to(gameId).emit('auctions_update', { auctions });
  }

  private broadcastGameState(gameId: string, game: any) {
    const publicState = this.sanitizeGameState(game);
    this.server.to(gameId).emit('game_state', publicState);
  }

  private sanitizeGameState(game: any) {
    const sanitizedPlayers: any = {};
    for (const pid of Object.keys(game.players)) {
      const player = game.players[pid];
      sanitizedPlayers[pid] = {
        id: player.id,
        name: player.name,
        money: player.money,
        isBankrupt: player.isBankrupt,
        ticketPrice: player.ticketPrice,
        plots: player.plots,
        ownedSeeds: player.ownedSeeds,
        researchProjects: player.researchProjects,
        discoveredSpecies: player.discoveredSpecies,
        actionsSubmitted: game.actionsSubmitted[pid] || false
      };
    }

    return {
      id: game.id,
      phase: game.phase,
      turn: game.turn,
      maxTurns: game.maxTurns,
      season: game.season,
      players: sanitizedPlayers,
      playerOrder: game.playerOrder,
      hostId: game.hostId,
      seedShop: game.seedShop,
      currentEvents: game.currentEvents,
      allSpecies: game.allSpecies,
      cityTouristBase: game.cityTouristBase,
      publicFunds: game.publicFunds || 0,
      tradeTaxRate: game.tradeTaxRate || 0.05
    };
  }
}
