import { Injectable } from '@nestjs/common';
import {
  PlayerState,
  PlantInstance,
  Plot,
  WeatherEvent,
  WeatherType,
  PlantDamageResult,
  PlayerDisasterResult,
  DamageLevel,
  PlantCategory,
  PlantSpecies,
  InsuranceStatus
} from '../types/game.types';
import { getPlantById } from '../data/plants.data';
import { DISASTER_DAMAGE } from '../config/weather.config';
import { GAME_CONFIG } from '../config/game.config';

@Injectable()
export class DisasterService {
  private seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  calculatePlantDamage(
    plant: PlantInstance,
    plot: Plot,
    species: PlantSpecies,
    weather: WeatherEvent,
    random: () => number
  ): { damage: number; level: DamageLevel } {
    if (weather.severity === 0) {
      return { damage: 0, level: DamageLevel.NONE };
    }

    let baseDamage = 0;
    let vulnerabilityMultiplier = 1;

    switch (weather.type) {
      case WeatherType.RAINSTORM:
        baseDamage = DISASTER_DAMAGE.HEAVY;
        if (species.category === PlantCategory.HERB) {
          vulnerabilityMultiplier = 1.5;
        } else if (species.category === PlantCategory.SUCCULENT) {
          vulnerabilityMultiplier = 1.8;
        } else if (species.category === PlantCategory.TREE) {
          vulnerabilityMultiplier = 0.6;
        }
        if (plot.type === 'pond') {
          vulnerabilityMultiplier *= 0.5;
        }
        break;

      case WeatherType.DROUGHT:
        baseDamage = DISASTER_DAMAGE.HEAVY;
        const avgWaterNeed = (species.waterRange[0] + species.waterRange[1]) / 2;
        if (avgWaterNeed >= 60) {
          vulnerabilityMultiplier = 1.6;
        } else if (avgWaterNeed >= 40) {
          vulnerabilityMultiplier = 1.0;
        } else {
          vulnerabilityMultiplier = 0.5;
        }
        if (species.category === PlantCategory.SUCCULENT) {
          vulnerabilityMultiplier *= 0.3;
        }
        if (plot.type === 'greenhouse') {
          vulnerabilityMultiplier *= 0.7;
        }
        break;

      case WeatherType.FROST:
        baseDamage = DISASTER_DAMAGE.HEAVY;
        const minTemp = species.tempRange[0];
        if (minTemp > 15) {
          vulnerabilityMultiplier = 2.5;
        } else if (minTemp > 10) {
          vulnerabilityMultiplier = 1.8;
        } else if (minTemp > 5) {
          vulnerabilityMultiplier = 1.2;
        } else {
          vulnerabilityMultiplier = 0.5;
        }
        if (plot.type === 'greenhouse') {
          vulnerabilityMultiplier *= 0.3;
        }
        if (species.category === PlantCategory.SUCCULENT) {
          vulnerabilityMultiplier *= 1.5;
        }
        break;

      case WeatherType.TYPHOON:
        baseDamage = DISASTER_DAMAGE.HEAVY;
        if (species.category === PlantCategory.TREE) {
          vulnerabilityMultiplier = 1.8;
        } else if (species.category === PlantCategory.SHRUB) {
          vulnerabilityMultiplier = 1.0;
        } else if (species.category === PlantCategory.VINE) {
          vulnerabilityMultiplier = 1.2;
        } else {
          vulnerabilityMultiplier = 0.6;
        }
        const growthRatio = plant.biomass / plant.maxBiomass;
        vulnerabilityMultiplier *= (0.5 + growthRatio * 0.5);
        if (plot.type === 'greenhouse') {
          vulnerabilityMultiplier *= 0.4;
        }
        break;

      case WeatherType.PEST:
        baseDamage = DISASTER_DAMAGE.LIGHT;
        vulnerabilityMultiplier = 0.8 + random() * 0.6;
        if (species.category === PlantCategory.HERB) {
          vulnerabilityMultiplier *= 1.3;
        }
        break;

      default:
        return { damage: 0, level: DamageLevel.NONE };
    }

    const severityMultiplier = 0.7 + weather.severity * 0.3;
    const finalDamage = Math.round(baseDamage * vulnerabilityMultiplier * severityMultiplier);

    let level: DamageLevel;
    if (finalDamage <= 0) {
      level = DamageLevel.NONE;
    } else if (finalDamage < DISASTER_DAMAGE.LIGHT) {
      level = DamageLevel.LIGHT;
    } else if (finalDamage < DISASTER_DAMAGE.HEAVY) {
      level = DamageLevel.HEAVY;
    } else {
      level = DamageLevel.DEADLY;
    }

    return { damage: finalDamage, level };
  }

  processPlayerDisaster(
    player: PlayerState,
    weather: WeatherEvent,
    gameSeed: number,
    turn: number
  ): PlayerDisasterResult {
    const damages: PlantDamageResult[] = [];
    let totalDamageCount = 0;
    let totalDeathCount = 0;
    let totalInsurancePayout = 0;

    const seed = gameSeed + turn * 10000 + player.id.charCodeAt(0) + weather.type.charCodeAt(0);
    const random = this.seededRandom(seed);

    const allPlots: { plot: Plot; x: number; y: number }[] = [];
    for (let y = 0; y < GAME_CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < GAME_CONFIG.GRID_SIZE; x++) {
        const plot = player.plots[y][x];
        if (plot.plant && plot.plant.health > 0) {
          allPlots.push({ plot, x, y });
        }
      }
    }

    let affectedPlots: { plot: Plot; x: number; y: number }[] = [];

    if (weather.type === WeatherType.PEST) {
      const pestCount = Math.min(
        allPlots.length,
        Math.floor(2 + random() * 3)
      );
      const shuffled = [...allPlots].sort(() => random() - 0.5);
      affectedPlots = shuffled.slice(0, pestCount);
    } else {
      affectedPlots = allPlots;
    }

    for (const { plot, x, y } of affectedPlots) {
      const plant = plot.plant!;
      const species = getPlantById(plant.speciesId);
      if (!species) continue;

      const { damage, level } = this.calculatePlantDamage(plant, plot, species, weather, random);

      if (damage > 0) {
        const healthBefore = plant.health;
        const healthAfter = Math.max(0, plant.health - damage);
        const died = healthAfter <= 0;

        let insurancePayout = 0;
        if (died && plant.insurance && plant.insurance.status === InsuranceStatus.ACTIVE) {
          const payout = Math.floor(plant.insurance.insuredValue * plant.insurance.payoutRate);
          insurancePayout = payout;
          totalInsurancePayout += payout;
          player.money += payout;
        }

        plant.health = healthAfter;

        if (died) {
          plot.plant = null;
          totalDeathCount++;
        }

        damages.push({
          plotId: plot.id,
          x,
          y,
          speciesId: species.id,
          speciesName: species.name,
          damageLevel: level,
          healthChange: -damage,
          healthBefore,
          healthAfter,
          died,
          insurancePayout: insurancePayout > 0 ? insurancePayout : undefined
        });

        if (damage > 0) {
          totalDamageCount++;
        }
      }
    }

    return {
      playerId: player.id,
      playerName: player.name,
      weatherType: weather.type,
      damages,
      totalDamageCount,
      totalDeathCount,
      totalInsurancePayout
    };
  }
}
