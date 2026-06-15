import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  PlayerState,
  Plot,
  PlantInstance,
  InsurancePolicy,
  InsurancePurchaseResult,
  InsuranceStatus,
  PlantSpecies
} from '../types/game.types';
import { getPlantById } from '../data/plants.data';
import { INSURANCE_CONFIG } from '../config/weather.config';
import { GAME_CONFIG } from '../config/game.config';

@Injectable()
export class InsuranceService {
  calculatePlantValue(plant: PlantInstance, species: PlantSpecies): number {
    const healthRatio = plant.health / 100;
    const growthRatio = plant.biomass / plant.maxBiomass;
    let value = species.baseValue * healthRatio * (0.3 + 0.7 * growthRatio);
    if (plant.isBlooming) {
      value *= GAME_CONFIG.BLOOM_VALUE_MULTIPLIER;
    }
    return Math.floor(value);
  }

  calculatePremium(plant: PlantInstance, species: PlantSpecies): number {
    const value = this.calculatePlantValue(plant, species);
    return Math.floor(value * INSURANCE_CONFIG.PREMIUM_RATE);
  }

  purchaseInsurance(
    player: PlayerState,
    x: number,
    y: number,
    currentTurn: number
  ): InsurancePurchaseResult {
    const plot = player.plots[y]?.[x];
    if (!plot) {
      return { success: false, error: '无效地块' };
    }

    const plant = plot.plant;
    if (!plant) {
      return { success: false, error: '该地块没有植物' };
    }

    if (plant.insurance && plant.insurance.status === InsuranceStatus.ACTIVE) {
      return { success: false, error: '该植物已有有效保险' };
    }

    const species = getPlantById(plant.speciesId);
    if (!species) {
      return { success: false, error: '未知植物种类' };
    }

    const plantValue = this.calculatePlantValue(plant, species);
    const premium = this.calculatePremium(plant, species);

    if (player.money < premium) {
      return { success: false, error: '资金不足' };
    }

    player.money -= premium;

    const policy: InsurancePolicy = {
      id: uuidv4(),
      plotId: plot.id,
      speciesId: plant.speciesId,
      premium,
      insuredValue: plantValue,
      payoutRate: INSURANCE_CONFIG.PAYOUT_RATE,
      startTurn: currentTurn,
      endTurn: currentTurn + INSURANCE_CONFIG.DURATION_TURNS,
      status: InsuranceStatus.ACTIVE
    };

    plant.insurance = policy;

    return {
      success: true,
      policy,
      premium,
      plantValue
    };
  }

  updateInsuranceStatus(player: PlayerState, currentTurn: number): { expired: InsurancePolicy[] } {
    const expired: InsurancePolicy[] = [];

    for (let y = 0; y < GAME_CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < GAME_CONFIG.GRID_SIZE; x++) {
        const plot = player.plots[y][x];
        const plant = plot.plant;
        if (!plant || !plant.insurance) continue;

        if (plant.insurance.status === InsuranceStatus.ACTIVE && currentTurn >= plant.insurance.endTurn) {
          plant.insurance.status = InsuranceStatus.EXPIRED;
          expired.push(plant.insurance);
        }
      }
    }

    return { expired };
  }

  getPlayerInsurances(player: PlayerState): { plot: Plot; policy: InsurancePolicy; speciesName: string }[] {
    const result: { plot: Plot; policy: InsurancePolicy; speciesName: string }[] = [];

    for (let y = 0; y < GAME_CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < GAME_CONFIG.GRID_SIZE; x++) {
        const plot = player.plots[y][x];
        const plant = plot.plant;
        if (!plant || !plant.insurance) continue;

        const species = getPlantById(plant.speciesId);
        result.push({
          plot,
          policy: plant.insurance,
          speciesName: species?.name || '未知'
        });
      }
    }

    return result;
  }

  getPlantInsuranceStatus(plant: PlantInstance | null, currentTurn: number): InsuranceStatus {
    if (!plant || !plant.insurance) {
      return InsuranceStatus.NONE;
    }
    if (plant.insurance.status === InsuranceStatus.ACTIVE && currentTurn >= plant.insurance.endTurn) {
      return InsuranceStatus.EXPIRED;
    }
    return plant.insurance.status;
  }
}
