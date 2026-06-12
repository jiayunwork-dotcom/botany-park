import { Injectable } from '@nestjs/common';
import {
  GameState,
  PlayerState,
  GamePhase,
  PlayerAction,
  Season,
  PlotType,
  PlantSpecies,
  Rarity,
  ResearchProject,
  RandomEvent
} from '../types/game.types';
import { RedisService } from './redis.service';
import { GameFactoryService } from './game-factory.service';
import { GameEngineService } from './game-engine.service';
import { getPlantById, PLANT_DATABASE } from '../data/plants.data';
import { GAME_CONFIG } from '../config/game.config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GameStateService {
  private readonly GAME_KEY_PREFIX = 'game:';

  constructor(
    private readonly redis: RedisService,
    private readonly gameFactory: GameFactoryService,
    private readonly gameEngine: GameEngineService
  ) {}

  private getGameKey(gameId: string): string {
    return `${this.GAME_KEY_PREFIX}${gameId}`;
  }

  async saveGame(game: GameState): Promise<void> {
    game.lastUpdate = Date.now();
    await this.redis.setJSON(this.getGameKey(game.id), game);
  }

  async getGame(gameId: string): Promise<GameState | null> {
    return this.redis.getJSON<GameState>(this.getGameKey(gameId));
  }

  async deleteGame(gameId: string): Promise<void> {
    await this.redis.del(this.getGameKey(gameId));
  }

  async createGame(hostId: string, hostName: string, hostSocketId: string): Promise<GameState> {
    const game = this.gameFactory.createGame(hostId, hostName, hostSocketId);
    await this.saveGame(game);
    return game;
  }

  async addPlayer(
    gameId: string,
    playerId: string,
    playerName: string,
    socketId: string
  ): Promise<GameState | null> {
    const game = await this.getGame(gameId);
    if (!game) return null;
    if (game.phase !== GamePhase.WAITING) return null;
    if (Object.keys(game.players).length >= GAME_CONFIG.MAX_PLAYERS) return null;
    if (game.players[playerId]) return game;

    game.players[playerId] = this.gameFactory.createPlayer(playerId, playerName, socketId);
    game.seedShop[playerId] = this.gameFactory.generateSeedShop();
    game.playerOrder.push(playerId);
    game.actionsSubmitted[playerId] = false;

    await this.saveGame(game);
    return game;
  }

  async removePlayer(gameId: string, playerId: string): Promise<GameState | null> {
    const game = await this.getGame(gameId);
    if (!game) return null;

    delete game.players[playerId];
    delete game.seedShop[playerId];
    delete game.actionsSubmitted[playerId];
    game.playerOrder = game.playerOrder.filter(id => id !== playerId);

    if (game.hostId === playerId && game.playerOrder.length > 0) {
      game.hostId = game.playerOrder[0];
    }

    if (Object.keys(game.players).length === 0) {
      await this.deleteGame(gameId);
      return null;
    }

    await this.saveGame(game);
    return game;
  }

  async startGame(gameId: string): Promise<GameState | null> {
    const game = await this.getGame(gameId);
    if (!game) return null;
    if (game.phase !== GamePhase.WAITING) return game;
    if (Object.keys(game.players).length < GAME_CONFIG.MIN_PLAYERS) return null;

    game.phase = GamePhase.PLAYING;
    game.turn = 1;
    game.season = Season.SPRING;

    Object.keys(game.players).forEach(pid => {
      game.actionsSubmitted[pid] = false;
    });

    await this.saveGame(game);
    return game;
  }

  async submitActions(gameId: string, playerId: string, actions: PlayerAction[]): Promise<GameState | null> {
    const game = await this.getGame(gameId);
    if (!game || game.phase !== GamePhase.PLAYING) return null;

    const player = game.players[playerId];
    if (!player || player.isBankrupt) return null;

    player.actions = actions;
    game.actionsSubmitted[playerId] = true;

    await this.saveGame(game);
    return game;
  }

  allActionsSubmitted(game: GameState): boolean {
    return Object.keys(game.players).every(pid => {
      const player = game.players[pid];
      return player.isBankrupt || game.actionsSubmitted[pid];
    });
  }

  async processTurn(gameId: string): Promise<{ game: GameState; events: string[] } | null> {
    const game = await this.getGame(gameId);
    if (!game || game.phase !== GamePhase.PLAYING) return null;
    if (!this.allActionsSubmitted(game)) return null;

    const events: string[] = [];

    for (const playerId of game.playerOrder) {
      const player = game.players[playerId];
      if (player.isBankrupt) continue;
      this.executePlayerActions(player, game, events);
    }

    for (const playerId of game.playerOrder) {
      const player = game.players[playerId];
      if (player.isBankrupt) continue;
      this.processConstruction(player);
    }

    game.season = this.gameEngine.advanceSeason(game.season);

    for (const playerId of game.playerOrder) {
      const player = game.players[playerId];
      if (player.isBankrupt) continue;
      this.processPlantGrowth(player, game, events);
    }

    const allPlayers = Object.values(game.players);
    for (const playerId of game.playerOrder) {
      const player = game.players[playerId];
      if (player.isBankrupt) continue;
      this.processVisitorsAndIncome(player, allPlayers, game, events);
    }

    for (const playerId of game.playerOrder) {
      const player = game.players[playerId];
      if (player.isBankrupt) continue;
      this.processResearch(player, game, events);
    }

    this.processRandomEvents(game, events);

    for (const playerId of game.playerOrder) {
      const player = game.players[playerId];
      if (player.isBankrupt) continue;
      if (player.money < 0) {
        player.debtTurns++;
        events.push(`${player.name} 资金不足，负债回合: ${player.debtTurns}`);
        if (player.debtTurns >= GAME_CONFIG.MAX_DEBT_TURNS) {
          player.isBankrupt = true;
          events.push(`${player.name} 连续负债，已破产出局！`);
        }
      } else {
        player.debtTurns = 0;
      }
    }

    for (const playerId of game.playerOrder) {
      game.actionsSubmitted[playerId] = false;
      const player = game.players[playerId];
      if (!player.isBankrupt) {
        player.actions = [];
        game.seedShop[playerId] = this.gameFactory.generateSeedShop();
      }
    }

    game.turn++;

    if (game.turn > game.maxTurns) {
      game.phase = GamePhase.FINISHED;
      events.push('游戏结束！最终排名已生成');
    }

    await this.saveGame(game);
    return { game, events };
  }

  private executePlayerActions(player: PlayerState, game: GameState, events: string[]) {
    for (const action of player.actions) {
      try {
        switch (action.type) {
          case 'plant':
            this.actionPlant(player, action.data, events);
            break;
          case 'remove':
            this.actionRemove(player, action.data, events);
            break;
          case 'upgrade':
            this.actionUpgrade(player, action.data, events);
            break;
          case 'set_ticket':
            this.actionSetTicket(player, action.data);
            break;
          case 'research':
            this.actionResearch(player, action.data, events);
            break;
          case 'sell_seed':
            this.actionSellSeed(player, action.data, game, events);
            break;
        }
      } catch (e) {
        events.push(`操作失败: ${e.message}`);
      }
    }
  }

  private actionPlant(player: PlayerState, data: { x: number; y: number; speciesId: string }, events: string[]) {
    const { x, y, speciesId } = data;
    const plot = player.plots[y]?.[x];
    if (!plot) throw new Error('无效地块');
    if (plot.plant) throw new Error('该地块已有植物');
    if (plot.constructionTurnsLeft > 0) throw new Error('地块正在施工');

    const species = getPlantById(speciesId);
    if (!species) throw new Error('未知物种');

    if (plot.type === PlotType.PATH || plot.type === PlotType.EXHIBITION || plot.type === PlotType.PAVILION) {
      throw new Error('该地块不可种植');
    }
    if (species.category === 'aquatic' && plot.type !== PlotType.POND) {
      throw new Error('水生植物只能种植在池塘');
    }
    if (plot.type === PlotType.POND && species.category !== 'aquatic') {
      throw new Error('池塘只能种植水生植物');
    }
    if (species.category === 'succulent' && plot.type !== PlotType.ROCK && plot.type !== PlotType.NORMAL) {
      throw new Error('多肉植物适合种植在岩石区或普通土地');
    }

    const seedCount = player.ownedSeeds[speciesId] || 0;
    if (seedCount <= 0) throw new Error('种子不足');

    player.ownedSeeds[speciesId] = seedCount - 1;
    const plant = this.gameFactory.createPlantInstance(speciesId);
    if (plant) {
      plot.plant = plant;
      events.push(`${player.name} 在 (${x},${y}) 种植了 ${species.name}`);
    }
  }

  private actionRemove(player: PlayerState, data: { x: number; y: number }, events: string[]) {
    const { x, y } = data;
    const plot = player.plots[y]?.[x];
    if (!plot || !plot.plant) throw new Error('无植物可移除');

    const species = getPlantById(plot.plant.speciesId);
    const refund = Math.floor((species?.price || 50) * 0.2 * (plot.plant.biomass / plot.plant.maxBiomass));
    player.money += refund;
    plot.plant = null;
    events.push(`${player.name} 移除了 (${x},${y}) 的植物，回收 ${refund} 金币`);
  }

  private actionUpgrade(player: PlayerState, data: { x: number; y: number; newType: PlotType }, events: string[]) {
    const { x, y, newType } = data;
    const plot = player.plots[y]?.[x];
    if (!plot) throw new Error('无效地块');
    if (plot.constructionTurnsLeft > 0) throw new Error('已在施工');

    const cost = GAME_CONFIG.PLOT_CONSTRUCTION[newType]?.cost || 0;
    const turns = GAME_CONFIG.PLOT_CONSTRUCTION[newType]?.turns || 0;

    if (player.money < cost) throw new Error('资金不足');

    player.money -= cost;
    plot.newType = newType;
    plot.constructionTurnsLeft = turns;
    events.push(`${player.name} 开始改造 (${x},${y})，花费 ${cost} 金币`);
  }

  private actionSetTicket(player: PlayerState, data: { price: number }) {
    const price = Math.max(
      GAME_CONFIG.TICKET_PRICE.min,
      Math.min(GAME_CONFIG.TICKET_PRICE.max, data.price)
    );
    player.ticketPrice = price;
  }

  private actionResearch(player: PlayerState, data: {
    type: 'hybrid' | 'endangered';
    parent1Id?: string;
    parent2Id?: string;
    endangeredSpeciesId?: string;
  }, events: string[]) {
    if (data.type === 'hybrid') {
      if (!data.parent1Id || !data.parent2Id) throw new Error('需要两个亲本');
      if (player.money < GAME_CONFIG.RESEARCH.HYBRID_COST) throw new Error('资金不足');

      player.money -= GAME_CONFIG.RESEARCH.HYBRID_COST;
      const project: ResearchProject = {
        id: uuidv4(),
        type: 'hybrid',
        parent1Id: data.parent1Id,
        parent2Id: data.parent2Id,
        turnsLeft: GAME_CONFIG.RESEARCH.HYBRID_TURNS,
        totalTurns: GAME_CONFIG.RESEARCH.HYBRID_TURNS
      };
      player.researchProjects.push(project);
      events.push(`${player.name} 启动杂交育种项目`);
    } else if (data.type === 'endangered') {
      if (!data.endangeredSpeciesId) throw new Error('需要指定濒危物种');
      if (player.money < GAME_CONFIG.RESEARCH.ENDANGERED_REWARD) throw new Error('资金不足');

      player.money -= 300;
      const project: ResearchProject = {
        id: uuidv4(),
        type: 'endangered',
        endangeredSpeciesId: data.endangeredSpeciesId,
        turnsLeft: GAME_CONFIG.RESEARCH.ENDANGERED_TURNS,
        totalTurns: GAME_CONFIG.RESEARCH.ENDANGERED_TURNS
      };
      player.researchProjects.push(project);
      player.ownedSeeds[data.endangeredSpeciesId] = (player.ownedSeeds[data.endangeredSpeciesId] || 0) + 1;
      events.push(`${player.name} 接受了濒危物种保护任务`);
    }
  }

  private actionSellSeed(player: PlayerState, data: { speciesId: string; quantity: number }, game: GameState, events: string[]) {
    const { speciesId, quantity } = data;
    const owned = player.ownedSeeds[speciesId] || 0;
    if (owned < quantity) throw new Error('种子不足');

    const species = getPlantById(speciesId);
    const sellPrice = Math.floor((species?.price || 50) * 0.5);
    const total = sellPrice * quantity;

    player.ownedSeeds[speciesId] = owned - quantity;
    player.money += total;
    events.push(`${player.name} 出售了 ${quantity} 颗 ${species?.name || '未知'} 种子，获得 ${total} 金币`);
  }

  private processConstruction(player: PlayerState) {
    for (let y = 0; y < GAME_CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < GAME_CONFIG.GRID_SIZE; x++) {
        const plot = player.plots[y][x];
        if (plot.constructionTurnsLeft > 0) {
          plot.constructionTurnsLeft--;
          if (plot.constructionTurnsLeft === 0 && plot.newType) {
            plot.type = plot.newType;
            plot.climate = this.gameFactory.getDefaultClimate(plot.newType);
            plot.newType = null;
          }
        }
      }
    }
  }

  private processPlantGrowth(player: PlayerState, game: GameState, events: string[]) {
    const ecologyEffects = this.gameEngine.calculateEcologyEffects(player);

    for (let y = 0; y < GAME_CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < GAME_CONFIG.GRID_SIZE; x++) {
        const plot = player.plots[y][x];
        if (!plot.plant) continue;

        const effects = ecologyEffects.get(plot.id) || { growthMod: 0, lightMod: 0, valueMod: 0 };
        const species = getPlantById(plot.plant.speciesId);

        plot.plant = this.gameEngine.growPlant(plot.plant, plot, game, effects);

        if (plot.plant.health <= 0 || (species && plot.plant.age >= species.lifespan)) {
          events.push(`${player.name} 的 (${x},${y}) ${species?.name || '植物'} 已枯死`);
          plot.plant = null;
        } else if (plot.plant.isBlooming && species) {
          events.push(`${player.name} 的 ${species.name} 在 (${x},${y}) 开花了！`);
        }
      }
    }
  }

  private processVisitorsAndIncome(player: PlayerState, allPlayers: PlayerState[], game: GameState, events: string[]) {
    const visitors = this.gameEngine.calculateVisitors(player, allPlayers, game);
    const ticketIncome = visitors * player.ticketPrice;
    const maintenanceCost = this.gameEngine.calculateMaintenanceCost(player);

    player.money += ticketIncome;
    player.money -= maintenanceCost;

    events.push(`${player.name}: 访客 ${visitors} 人，门票收入 ${ticketIncome}，维护支出 ${maintenanceCost}`);
  }

  private processResearch(player: PlayerState, game: GameState, events: string[]) {
    const completedProjects: ResearchProject[] = [];

    for (const project of player.researchProjects) {
      project.turnsLeft--;
      if (project.turnsLeft <= 0) {
        completedProjects.push(project);

        if (project.type === 'hybrid' && project.parent1Id && project.parent2Id) {
          const newSpecies = this.createHybridSpecies(project.parent1Id, project.parent2Id, game);
          if (newSpecies) {
            game.allSpecies[newSpecies.id] = newSpecies;
            player.discoveredSpecies.push(newSpecies.id);
            player.ownedSeeds[newSpecies.id] = (player.ownedSeeds[newSpecies.id] || 0) + 3;
            events.push(`${player.name} 培育出新品种: ${newSpecies.name}！`);
          }
        } else if (project.type === 'endangered' && project.endangeredSpeciesId) {
          player.money += GAME_CONFIG.RESEARCH.ENDANGERED_REWARD;
          events.push(`${player.name} 完成濒危物种保护，获得 ${GAME_CONFIG.RESEARCH.ENDANGERED_REWARD} 金币奖励`);
        }
      }
    }

    player.researchProjects = player.researchProjects.filter(p => p.turnsLeft > 0);
  }

  private createHybridSpecies(parent1Id: string, parent2Id: string, game: GameState): PlantSpecies | null {
    const p1 = getPlantById(parent1Id) || game.allSpecies[parent1Id];
    const p2 = getPlantById(parent2Id) || game.allSpecies[parent2Id];
    if (!p1 || !p2) return null;

    const inherit = <T>(a: T, b: T): T => Math.random() < 0.5 ? a : b;
    const mutateNum = (val: number, range: number): number => {
      if (Math.random() < GAME_CONFIG.RESEARCH.MUTATION_CHANCE) {
        return val + (Math.random() - 0.5) * range * 2;
      }
      return val;
    };

    const newId = `hybrid_${uuidv4().slice(0, 8)}`;
    const rarities = [Rarity.COMMON, Rarity.UNCOMMON, Rarity.RARE, Rarity.EPIC, Rarity.LEGENDARY];
    const p1RarityIdx = rarities.indexOf(p1.rarity);
    const p2RarityIdx = rarities.indexOf(p2.rarity);
    const newRarityIdx = Math.min(rarities.length - 1, Math.max(p1RarityIdx, p2RarityIdx) + (Math.random() < 0.3 ? 1 : 0));

    const species: PlantSpecies = {
      id: newId,
      name: `${p1.name.slice(0, 1)}${p2.name.slice(-1)}${Math.floor(Math.random() * 100)}号`,
      category: inherit(p1.category, p2.category),
      icon: inherit(p1.icon, p2.icon),
      lightRange: [
        Math.min(p1.lightRange[0], p2.lightRange[0]),
        Math.max(p1.lightRange[1], p2.lightRange[1])
      ],
      waterRange: [
        Math.min(p1.waterRange[0], p2.waterRange[0]),
        Math.max(p1.waterRange[1], p2.waterRange[1])
      ],
      tempRange: [
        Math.min(p1.tempRange[0], p2.tempRange[0]),
        Math.max(p1.tempRange[1], p2.tempRange[1])
      ],
      phRange: [
        Math.min(p1.phRange[0], p2.phRange[0]),
        Math.max(p1.phRange[1], p2.phRange[1])
      ],
      growthRate: mutateNum((p1.growthRate + p2.growthRate) / 2, 0.05),
      baseValue: Math.round(mutateNum(Math.max(p1.baseValue, p2.baseValue) * 1.1, 100)),
      bloomMonths: [...new Set([...p1.bloomMonths, ...p2.bloomMonths])].sort(),
      lifespan: Math.round((p1.lifespan + p2.lifespan) / 2),
      rarity: rarities[newRarityIdx],
      price: Math.round(Math.max(p1.price, p2.price) * 1.2),
      description: `${p1.name} 与 ${p2.name} 的杂交品种`
    };

    return species;
  }

  private processRandomEvents(game: GameState, events: string[]) {
    if (Math.random() < 0.3) {
      const eventTypes = ['pest', 'weather', 'media', 'policy'] as const;
      const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      const severity = Math.ceil(Math.random() * 3);

      let description = '';
      let affected: string[] = [];

      switch (eventType) {
        case 'pest':
          description = `虫害爆发！严重等级: ${severity}`;
          affected = Object.keys(game.players);
          for (const pid of affected) {
            const player = game.players[pid];
            if (!player.isBankrupt) {
              for (let y = 0; y < GAME_CONFIG.GRID_SIZE; y++) {
                for (let x = 0; x < GAME_CONFIG.GRID_SIZE; x++) {
                  if (player.plots[y][x].plant && Math.random() < severity * 0.1) {
                    player.plots[y][x].plant!.health -= severity * 15;
                  }
                }
              }
              player.money -= severity * 100;
            }
          }
          break;
        case 'weather':
          const weathers = ['暴雨', '干旱', '寒潮', '热浪'];
          description = `极端天气: ${weathers[Math.floor(Math.random() * weathers.length)]}，等级: ${severity}`;
          affected = Object.keys(game.players);
          break;
        case 'media':
          const mediaPlayers = Object.keys(game.players).filter(pid => !game.players[pid].isBankrupt);
          if (mediaPlayers.length > 0) {
            const luckyPlayer = mediaPlayers[Math.floor(Math.random() * mediaPlayers.length)];
            description = `媒体报道: ${game.players[luckyPlayer].name} 的植物园受到关注！`;
            game.players[luckyPlayer].money += severity * 200;
            affected = [luckyPlayer];
          }
          break;
        case 'policy':
          description = `政策调整: 植物园补贴 ${severity * 100} 金币`;
          affected = Object.keys(game.players);
          for (const pid of affected) {
            if (!game.players[pid].isBankrupt) {
              game.players[pid].money += severity * 100;
            }
          }
          break;
      }

      if (description) {
        events.push(`【随机事件】${description}`);
        game.currentEvents.push({
          type: eventType,
          severity,
          description,
          affects: affected
        });
      }
    }
  }
}
