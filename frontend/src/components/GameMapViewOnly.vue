<template>
  <div class="game-map-container">
    <div class="map-legend">
      <span v-for="(label, key) in plotTypeLabels" :key="key" class="legend-item">
        <span :class="`plot-${key}` legend-color"></span>
        {{ label }}
      </span>
    </div>

    <div
      class="game-map"
      :style="{
        gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
        gridTemplateRows: `repeat(${gridSize}, 1fr)`
      }"
    >
      <template v-for="row in player.plots" :key="`row-${row[0]?.y}`">
        <div
          v-for="plot in row"
          :key="plot.id"
          class="plot-cell"
          :class="[
            `plot-${plot.type}`,
            {
              'under-construction': plot.constructionTurnsLeft > 0,
              'has-plant': plot.plant
            }
          ]"
        >
          <div v-if="plot.constructionTurnsLeft > 0" class="construction-overlay">
            <span class="construction-icon">🔨</span>
          </div>

          <div v-else-if="plot.plant" class="plant-display">
            <span class="plant-icon" :class="{ blooming: plot.plant.isBlooming }">
              {{ getPlantIcon(plot.plant.speciesId) }}
            </span>
            <div class="plant-bars">
              <div class="health-bar">
                <div
                  class="health-fill"
                  :class="getHealthClass(plot.plant.health)"
                  :style="{ width: `${plot.plant.health}%` }"
                ></div>
              </div>
              <div class="growth-bar">
                <div
                  class="growth-fill"
                  :style="{ width: `${(plot.plant.biomass / plot.plant.maxBiomass) * 100}%` }"
                ></div>
              </div>
            </div>
            <div v-if="plot.plant.isBlooming" class="bloom-tag">🌸</div>
          </div>

          <div v-else class="plot-type-icon">
            {{ getPlotIcon(plot.type) }}
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlayerState } from '../types/game';
import { useGameStore } from '../stores/game';

defineProps<{
  player: PlayerState;
}>();

const gameStore = useGameStore();
const gridSize = 12;

const plotTypeLabels: any = {
  normal: '普通土地',
  greenhouse: '温室',
  pond: '池塘',
  rock: '岩石区',
  path: '步道',
  exhibition: '科普展区',
  pavilion: '休息亭'
};

const plotTypeIcons: any = {
  normal: '🟫',
  greenhouse: '🏠',
  pond: '💧',
  rock: '🪨',
  path: '🛤️',
  exhibition: '📚',
  pavilion: '⛺'
};

function getPlotIcon(type: string) {
  return plotTypeIcons[type] || '🟫';
}

function getPlantIcon(speciesId: string) {
  return gameStore.allSpecies[speciesId]?.icon || '🌱';
}

function getHealthClass(health: number) {
  if (health >= 80) return 'health-excellent';
  if (health >= 60) return 'health-good';
  if (health >= 40) return 'health-fair';
  if (health >= 20) return 'health-poor';
  return 'health-critical';
}
</script>

<style scoped>
.game-map-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: calc(100% - 50px);
}

.map-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px;
  font-size: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-color {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.2);
}

.game-map {
  flex: 1;
  display: grid;
  gap: 2px;
  aspect-ratio: 1;
  max-height: 100%;
  max-width: 100%;
  margin: 0 auto;
  background: rgba(0, 0, 0, 0.1);
  padding: 4px;
  border-radius: 8px;
}

.plot-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}

.construction-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.construction-icon {
  font-size: 16px;
}

.plant-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 2px;
  gap: 1px;
}

.plant-icon {
  font-size: 18px;
  line-height: 1;
}

.plant-bars {
  width: 80%;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.bloom-tag {
  position: absolute;
  top: 1px;
  right: 1px;
  font-size: 10px;
}

.plot-type-icon {
  font-size: 12px;
  opacity: 0.6;
}
</style>
