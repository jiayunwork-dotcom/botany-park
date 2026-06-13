import { Injectable } from '@nestjs/common';
import {
  GameState,
  PlayerState,
  Plot,
  PlantInstance,
  Season,
  PlotType,
  PlantSpecies,
  LeaderboardEntry,
  WeatherForecast,
  SeasonEnvironment
} from '../types/game.types';
import { getPlantById } from '../data/plants.data';
import { GAME_CONFIG } from '../config/game.config';

@Injectable()
export class GameEngineService {
  advanceSeason(currentSeason: Season): Season {
    const seasons = [Season.SPRING, Season.SUMMER, Season.AUTUMN, Season.WINTER];
    const idx = seasons.indexOf(currentSeason);
    return seasons[(idx + 1) % 4];
  }

  getMonthOfSeason(turn: number): number {
    const seasonMonthMap: { [key in Season]: number[] } = {
      [Season.SPRING]: [2, 3, 4],
      [Season.SUMMER]: [5, 6, 7],
      [Season.AUTUMN]: [8, 9, 10],
      [Season.WINTER]: [11, 12, 1]
    };
    const seasons = [Season.SPRING, Season.SUMMER, Season.AUTUMN, Season.WINTER];
    const season = seasons[Math.floor((turn - 1) % 4)];
    const months = seasonMonthMap[season];
    return months[Math.floor(Math.random() * months.length)];
  }

  calculateEnvironmentFactor(
    value: number,
    minOptimal: number,
    maxOptimal: number
  ): number {
    if (value >= minOptimal && value <= maxOptimal) {
      return 1;
    }
    const center = (minOptimal + maxOptimal) / 2;
    const range = (maxOptimal - minOptimal) / 2;
    const distance = Math.abs(value - center);
    const sigma = range * 1.5;
    return Math.exp(-(distance * distance) / (2 * sigma * sigma));
  }

  getEffectiveClimate(plot: Plot, game: GameState): {
    light: number;
    temp: number;
    humidity: number;
    ph: number;
  } {
    const seasonConfig = GAME_CONFIG.SEASON[game.season];
    let light = plot.climate.light * 0.3 + seasonConfig.light * 0.7;
    let temp = 20 + seasonConfig.tempModifier;

    if (plot.type === PlotType.GREENHOUSE) {
      light *= GAME_CONFIG.GREENHOUSE.lightModifier;
      temp = GAME_CONFIG.GREENHOUSE.tempStable;
    }

    return {
      light,
      temp,
      humidity: plot.climate.humidity,
      ph: plot.climate.ph
    };
  }

  calculateSuitability(plant: PlantInstance, plot: Plot, game: GameState): number {
    const species = getPlantById(plant.speciesId);
    if (!species) return 0;

    const climate = this.getEffectiveClimate(plot, game);
    const lightFactor = this.calculateEnvironmentFactor(
      climate.light, species.lightRange[0], species.lightRange[1]
    );
    const waterFactor = this.calculateEnvironmentFactor(
      climate.humidity, species.waterRange[0], species.waterRange[1]
    );
    const tempFactor = this.calculateEnvironmentFactor(
      climate.temp, species.tempRange[0], species.tempRange[1]
    );
    const phFactor = this.calculateEnvironmentFactor(
      climate.ph, species.phRange[0], species.phRange[1]
    );

    return lightFactor * waterFactor * tempFactor * phFactor;
  }

  getAdjacentPlots(plots: Plot[][], x: number, y: number): Plot[] {
    const adjacent: Plot[] = [];
    const directions = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0], [1, 0],
      [-1, 1], [0, 1], [1, 1]
    ];

    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < GAME_CONFIG.GRID_SIZE && ny >= 0 && ny < GAME_CONFIG.GRID_SIZE) {
        adjacent.push(plots[ny][nx]);
      }
    }
    return adjacent;
  }

  calculateEcologyEffects(player: PlayerState): Map<string, { growthMod: number; lightMod: number; valueMod: number }> {
    const effects = new Map<string, { growthMod: number; lightMod: number; valueMod: number }>();

    for (let y = 0; y < GAME_CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < GAME_CONFIG.GRID_SIZE; x++) {
        const plot = player.plots[y][x];
        if (!plot.plant) continue;

        const plotEffects = { growthMod: 0, lightMod: 0, valueMod: 0 };
        const species = getPlantById(plot.plant.speciesId);
        if (!species) continue;

        const adjacent = this.getAdjacentPlots(player.plots, x, y);

        for (const adj of adjacent) {
          if (!adj.plant) continue;
          const adjSpecies = getPlantById(adj.plant.speciesId);
          if (!adjSpecies) continue;

          if (species.pollinationPartners?.includes(adjSpecies.id)) {
            plotEffects.valueMod += 0.1;
          }

          if (species.symbiosisPartners?.includes(adjSpecies.id)) {
            plotEffects.growthMod += 0.2;
          }

          if (species.competitionGroup && species.competitionGroup === adjSpecies.competitionGroup) {
            plotEffects.lightMod -= 0.15;
          }

          if (adjSpecies.allelopathyTargets?.includes(species.id)) {
            plotEffects.growthMod -= 0.3;
          }
        }

        effects.set(plot.id, plotEffects);
      }
    }

    return effects;
  }

  growPlant(
    plant: PlantInstance,
    plot: Plot,
    game: GameState,
    ecologyEffects: { growthMod: number; lightMod: number; valueMod: number }
  ): PlantInstance {
    const species = getPlantById(plant.speciesId);
    if (!species) return plant;

    if (plant.domesticationTurns > 0) {
      plant.domesticationTurns--;
      return plant;
    }

    let suitability = this.calculateSuitability(plant, plot, game);
    suitability = Math.min(1, suitability + ecologyEffects.lightMod);
    suitability = Math.max(0, suitability);

    const r = species.growthRate * (1 + ecologyEffects.growthMod) * plant.growthModifier;
    const K = plant.maxBiomass;
    const current = plant.biomass;
    const growth = r * current * (1 - current / K) * suitability;

    plant.biomass = Math.min(K, current + growth);
    plant.age++;

    if (suitability < 0.5) {
      plant.health -= Math.ceil((0.5 - suitability) * 20);
    } else if (plant.health < 100) {
      plant.health = Math.min(100, plant.health + 5);
    }
    plant.health = Math.max(0, Math.min(100, plant.health));

    if (plant.health <= 0 || plant.age >= species.lifespan) {
      return plant;
    }

    const currentMonth = this.getMonthOfSeason(game.turn);
    const climate = this.getEffectiveClimate(plot, game);
    const meetsLight = climate.light >= species.lightRange[0];
    plant.isBlooming =
      plant.health > GAME_CONFIG.MIN_HEALTH_TO_BLOOM &&
      species.bloomMonths.includes(currentMonth) &&
      meetsLight;

    return plant;
  }

  calculateShannonIndex(plots: Plot[][]): number {
    const speciesCount = new Map<string, number>();
    let totalPlants = 0;

    for (let y = 0; y < GAME_CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < GAME_CONFIG.GRID_SIZE; x++) {
        if (plots[y][x].plant && plots[y][x].plant.health > 0) {
          const speciesId = plots[y][x].plant.speciesId;
          speciesCount.set(speciesId, (speciesCount.get(speciesId) || 0) + 1);
          totalPlants++;
        }
      }
    }

    if (totalPlants === 0) return 0;

    let diversity = 0;
    speciesCount.forEach((count) => {
      const p = count / totalPlants;
      diversity -= p * Math.log(p);
    });

    return diversity;
  }

  calculateLandscapeScore(player: PlayerState): number {
    let pathCount = 0;
    let connectedPaths = 0;
    let pavilionCount = 0;
    let exhibitionCount = 0;
    let plantablePlots = 0;

    for (let y = 0; y < GAME_CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < GAME_CONFIG.GRID_SIZE; x++) {
        const plot = player.plots[y][x];
        if (plot.type === PlotType.PATH) {
          pathCount++;
          const adjacent = this.getAdjacentPlots(player.plots, x, y);
          if (adjacent.some(a => a.type === PlotType.PATH)) {
            connectedPaths++;
          }
        } else if (plot.type === PlotType.PAVILION) {
          pavilionCount++;
        } else if (plot.type === PlotType.EXHIBITION) {
          exhibitionCount++;
        } else if (
          plot.type === PlotType.NORMAL ||
          plot.type === PlotType.GREENHOUSE ||
          plot.type === PlotType.ROCK ||
          plot.type === PlotType.POND
        ) {
          plantablePlots++;
        }
      }
    }

    const connectivity = pathCount > 0 ? connectedPaths / pathCount : 0;
    const pathScore = pathCount * 2 + connectivity * 20;
    const pavilionScore = pavilionCount * 15;
    const exhibitionScore = exhibitionCount * 25;

    return pathScore + pavilionScore + exhibitionScore;
  }

  countBloomingPlants(player: PlayerState): number {
    let count = 0;
    for (let y = 0; y < GAME_CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < GAME_CONFIG.GRID_SIZE; x++) {
        if (player.plots[y][x].plant?.isBlooming) {
          count++;
        }
      }
    }
    return count;
  }

  calculateAttractionScore(player: PlayerState, game: GameState): number {
    if (player.isBankrupt) return 0;

    const diversity = this.calculateShannonIndex(player.plots);
    const blooming = this.countBloomingPlants(player);
    const landscape = this.calculateLandscapeScore(player);

    let plantValue = 0;
    for (let y = 0; y < GAME_CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < GAME_CONFIG.GRID_SIZE; x++) {
        const plant = player.plots[y][x].plant;
        if (plant && plant.health > 0) {
          const species = getPlantById(plant.speciesId);
          if (species) {
            const healthRatio = plant.health / 100;
            const growthRatio = plant.biomass / plant.maxBiomass;
            let value = species.baseValue * healthRatio * (0.3 + 0.7 * growthRatio);
            if (plant.isBlooming) {
              value *= GAME_CONFIG.BLOOM_VALUE_MULTIPLIER;
            }
            plantValue += value;
          }
        }
      }
    }

    return diversity * 50 + blooming * 10 + landscape + plantValue * 0.1;
  }

  calculateVisitors(player: PlayerState, allPlayers: PlayerState[], game: GameState): number {
    const attractionScores = allPlayers.map(p => this.calculateAttractionScore(p, game));
    const totalAttraction = attractionScores.reduce((a, b) => a + b, 0);

    if (totalAttraction === 0) return 0;

    const playerIdx = allPlayers.findIndex(p => p.id === player.id);
    const myAttraction = attractionScores[playerIdx];
    const baseVisitors = (myAttraction / totalAttraction) * game.cityTouristBase;

    const priceEffect = Math.exp(-GAME_CONFIG.TICKET_PRICE.elasticity * (player.ticketPrice - GAME_CONFIG.TICKET_PRICE.default));

    return Math.floor(baseVisitors * priceEffect);
  }

  calculateMaintenanceCost(player: PlayerState): number {
    let plantCareCost = 0;
    let plantCount = 0;
    let facilityCost = 0;

    for (let y = 0; y < GAME_CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < GAME_CONFIG.GRID_SIZE; x++) {
        const plot = player.plots[y][x];

        if (plot.plant && plot.plant.health > 0) {
          plantCount++;
          const species = getPlantById(plot.plant.speciesId);
          if (species) {
            plantCareCost += GAME_CONFIG.PLANT_CARE_COST[species.category] || 5;
          }
        }

        facilityCost += GAME_CONFIG.PLOT_MAINTENANCE[plot.type] || 0;
      }
    }

    const employeeSalary = GAME_CONFIG.BASE_EMPLOYEE_SALARY +
      Math.floor(plantCount / 10) * GAME_CONFIG.SALARY_PER_10_PLANTS;

    let domesticationCost = 0;
    for (let y = 0; y < GAME_CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < GAME_CONFIG.GRID_SIZE; x++) {
        if (player.plots[y][x].plant?.domesticationTurns > 0) {
          domesticationCost += GAME_CONFIG.RESEARCH.DOMESTICATION_COST_PER_TURN;
        }
      }
    }

    return plantCareCost + employeeSalary + facilityCost + domesticationCost;
  }

  calculatePlayerScore(player: PlayerState, game: GameState): LeaderboardEntry {
    let plantValue = 0;
    for (let y = 0; y < GAME_CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < GAME_CONFIG.GRID_SIZE; x++) {
        const plant = player.plots[y][x].plant;
        if (plant && plant.health > 0) {
          const species = getPlantById(plant.speciesId);
          if (species) {
            const healthRatio = plant.health / 100;
            const growthRatio = plant.biomass / plant.maxBiomass;
            let value = species.baseValue * healthRatio * (0.3 + 0.7 * growthRatio);
            if (plant.isBlooming) value *= GAME_CONFIG.BLOOM_VALUE_MULTIPLIER;
            plantValue += value;
          }
        }
      }
    }

    const diversity = this.calculateShannonIndex(player.plots) * 100;
    const research = player.researchProjects.length * 30 + player.discoveredSpecies.length * 10;
    const satisfaction = this.calculateLandscapeScore(player);

    const totalScore = plantValue + player.money + diversity + research + satisfaction;

    return {
      playerId: player.id,
      name: player.name,
      score: Math.round(totalScore),
      plantValue: Math.round(plantValue),
      money: player.money,
      diversity: Math.round(diversity),
      research,
      satisfaction: Math.round(satisfaction)
    };
  }

  getLeaderboard(game: GameState): LeaderboardEntry[] {
    const players = Object.values(game.players);
    const entries = players.map(p => this.calculatePlayerScore(p, game));
    return entries.sort((a, b) => b.score - a.score);
  }

  private getSeasonEnvironment(season: Season): SeasonEnvironment {
    const config = GAME_CONFIG.SEASON[season];
    return {
      light: config.light,
      tempModifier: config.tempModifier,
      temp: GAME_CONFIG.BASE_TEMPERATURE + config.tempModifier
    };
  }

  getWeatherForecast(game: GameState): WeatherForecast {
    const currentSeason = game.season;
    const nextSeason = this.advanceSeason(currentSeason);

    const currentConfig = GAME_CONFIG.SEASON[currentSeason];
    const nextConfig = GAME_CONFIG.SEASON[nextSeason];

    const turnsPerYear = GAME_CONFIG.TURNS_PER_YEAR;
    const currentTurnInYear = (game.turn - 1) % turnsPerYear;
    const seasonProgress = ((currentTurnInYear + 1) / turnsPerYear) * 25;

    return {
      currentSeason,
      currentSeasonName: currentConfig.name,
      currentEnvironment: this.getSeasonEnvironment(currentSeason),
      nextSeason,
      nextSeasonName: nextConfig.name,
      nextEnvironment: this.getSeasonEnvironment(nextSeason),
      seasonProgress
    };
  }

  calculateSuitabilityForPlantAndPlot(
    speciesId: string,
    plot: Plot,
    game: GameState
  ): number {
    const species = getPlantById(speciesId) || game.allSpecies[speciesId];
    if (!species) return 0;

    const climate = this.getEffectiveClimate(plot, game);
    const lightFactor = this.calculateEnvironmentFactor(
      climate.light, species.lightRange[0], species.lightRange[1]
    );
    const waterFactor = this.calculateEnvironmentFactor(
      climate.humidity, species.waterRange[0], species.waterRange[1]
    );
    const tempFactor = this.calculateEnvironmentFactor(
      climate.temp, species.tempRange[0], species.tempRange[1]
    );
    const phFactor = this.calculateEnvironmentFactor(
      climate.ph, species.phRange[0], species.phRange[1]
    );

    const score = Math.round((lightFactor * waterFactor * tempFactor * phFactor) * 100);
    return Math.max(0, Math.min(100, score));
  }
}
