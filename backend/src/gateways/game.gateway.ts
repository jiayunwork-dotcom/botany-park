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
import { PlayerAction, GamePhase } from '../types/game.types';
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
    private readonly gameEngine: GameEngineService
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
        const { game: updatedGame, events, randomEvents, weatherForecast } = result;
        const leaderboard = this.gameEngine.getLeaderboard(updatedGame);

        this.server.to(updatedGame.id).emit('turn_processed', {
          turn: updatedGame.turn,
          season: updatedGame.season,
          events,
          randomEvents,
          weatherForecast,
          leaderboard
        });

        if (updatedGame.phase === GamePhase.FINISHED) {
          this.server.to(updatedGame.id).emit('game_finished', {
            leaderboard
          });
        }

        this.broadcastGameState(updatedGame.id, updatedGame);
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
      cityTouristBase: game.cityTouristBase
    };
  }
}
