import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  GameState,
  PlayerState,
  Plot,
  PlotType,
  MicroClimate,
  GamePhase,
  Season,
  PlantInstance,
  SeedShopItem,
  Rarity
} from '../types/game.types';
import { PLANT_DATABASE, getPlantById } from '../data/plants.data';
import { GAME_CONFIG } from '../config/game.config';

@Injectable()
export class GameFactoryService {
  createGame(hostId: string, hostName: string, hostSocketId: string): GameState {
    const gameId = uuidv4();
    const gameSeed = Math.floor(Math.random() * 1000000);
    const game: GameState = {
      id: gameId,
      phase: GamePhase.WAITING,
      turn: 0,
      maxTurns: GAME_CONFIG.MAX_TURNS,
      season: Season.SPRING,
      players: {},
      playerOrder: [hostId],
      hostId,
      seedShop: {},
      currentEvents: [],
      cityTouristBase: GAME_CONFIG.CITY_TOURIST_BASE,
      actionsSubmitted: {},
      allSpecies: { ...PLANT_DATABASE },
      lastUpdate: Date.now(),
      publicFunds: 0,
      tradeTaxRate: 0.05,
      gameSeed,
      currentWeather: null,
      nextTurnForecast: null
    };

    game.players[hostId] = this.createPlayer(hostId, hostName, hostSocketId);
    game.seedShop[hostId] = this.generateSeedShop();

    return game;
  }

  createPlayer(id: string, name: string, socketId: string): PlayerState {
    return {
      id,
      name,
      socketId,
      money: GAME_CONFIG.INITIAL_MONEY,
      debtTurns: 0,
      isBankrupt: false,
      ticketPrice: GAME_CONFIG.TICKET_PRICE.default,
      plots: this.initializePlots(),
      ownedSeeds: {
        'rose': 3,
        'sunflower': 5,
        'clover': 5,
        'lavender': 2
      },
      researchProjects: [],
      discoveredSpecies: ['rose', 'sunflower', 'clover', 'lavender', 'oak', 'pine', 'maple'],
      actions: [],
      lastTurnSnapshot: null,
      endangeredPlants: [],
      claimRecords: [],
      insuranceStats: { totalPolicies: 0, totalPremiumsPaid: 0, totalClaimsReceived: 0 }
    };
  }

  initializePlots(): Plot[][] {
    const plots: Plot[][] = [];
    const size = GAME_CONFIG.GRID_SIZE;

    for (let y = 0; y < size; y++) {
      plots[y] = [];
      for (let x = 0; x < size; x++) {
        let type = PlotType.NORMAL;

        const isEdge = x === 0 || x === size - 1 || y === 0 || y === size - 1;
        if (isEdge && Math.random() < 0.3) {
          type = PlotType.ROCK;
        }

        const centerDist = Math.abs(x - size / 2) + Math.abs(y - size / 2);
        if (centerDist <= 2 && Math.random() < 0.15) {
          type = PlotType.POND;
        }

        plots[y][x] = {
          id: `plot_${x}_${y}`,
          x,
          y,
          type,
          plant: null,
          climate: this.getDefaultClimate(type),
          constructionTurnsLeft: 0,
          newType: null
        };
      }
    }

    return plots;
  }

  getDefaultClimate(plotType: PlotType): MicroClimate {
    const base: MicroClimate = {
      light: 60,
      humidity: 50,
      ph: 6.5,
      wind: 1
    };

    switch (plotType) {
      case PlotType.GREENHOUSE:
        return { ...base, light: 70, humidity: 65, ph: 6.5, wind: 0 };
      case PlotType.POND:
        return { ...base, light: 65, humidity: 95, ph: 6.8, wind: 1 };
      case PlotType.ROCK:
        return { ...base, light: 75, humidity: 20, ph: 7.2, wind: 2 };
      case PlotType.PATH:
        return { ...base, humidity: 30 };
      case PlotType.EXHIBITION:
        return { ...base, humidity: 45 };
      case PlotType.PAVILION:
        return { ...base, light: 40, humidity: 40, wind: 0 };
      default:
        return base;
    }
  }

  generateSeedShop(): SeedShopItem[] {
    const allSpecies = Object.values(PLANT_DATABASE);
    const shop: SeedShopItem[] = [];
    const selected = new Set<string>();

    const commonSpecies = allSpecies.filter(s => s.rarity === Rarity.COMMON);
    const uncommonSpecies = allSpecies.filter(s => s.rarity === Rarity.UNCOMMON);
    const rareSpecies = allSpecies.filter(s => s.rarity === Rarity.RARE);
    const epicSpecies = allSpecies.filter(s => s.rarity === Rarity.EPIC);
    const legendarySpecies = allSpecies.filter(s => s.rarity === Rarity.LEGENDARY);

    const pickRandom = (arr: typeof allSpecies, count: number) => {
      const shuffled = [...arr].sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(count, shuffled.length); i++) {
        if (!selected.has(shuffled[i].id)) {
          selected.add(shuffled[i].id);
          shop.push({
            speciesId: shuffled[i].id,
            stock: Math.floor(Math.random() * 5) + 2,
            price: shuffled[i].price
          });
        }
      }
    };

    pickRandom(commonSpecies, 5);
    pickRandom(uncommonSpecies, 3);
    pickRandom(rareSpecies, 2);

    if (Math.random() < 0.3) {
      pickRandom(epicSpecies, 1);
    }
    if (Math.random() < 0.1) {
      pickRandom(legendarySpecies, 1);
    }

    return shop;
  }

  createPlantInstance(speciesId: string, isWild: boolean = false): PlantInstance | null {
    const species = getPlantById(speciesId);
    if (!species) return null;

    const maxBiomass = species.baseValue * 2;
    return {
      speciesId,
      health: 100,
      biomass: maxBiomass * 0.05,
      maxBiomass,
      age: 0,
      isBlooming: false,
      growthModifier: 1,
      isWild,
      domesticationTurns: isWild ? GAME_CONFIG.RESEARCH.DOMESTICATION_TURNS : 0
    };
  }
}
