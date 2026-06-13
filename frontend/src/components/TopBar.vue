<template>
  <div class="top-bar">
    <div class="game-info">
      <span class="room-id">房间号: {{ gameStore.gameState?.id.slice(0, 8) }}</span>
      <span class="turn">
        回合 {{ gameStore.gameState?.turn }} / {{ gameStore.gameState?.maxTurns }}
      </span>
    </div>

    <div class="weather-forecast">
      <div class="current-season">
        <span class="season-icon">{{ gameStore.seasonConfig.icon }}</span>
        <div class="season-info">
          <div class="season-name">{{ gameStore.seasonConfig.name }}</div>
          <div class="season-params">
            <span class="param">☀️ {{ currentLight }}</span>
            <span class="param">🌡️ {{ currentTemp }}°C</span>
          </div>
        </div>
      </div>

      <div class="next-season-preview">
        <span class="arrow">→</span>
        <div class="next-season-info">
          <span class="next-icon">{{ gameStore.nextSeasonConfig.icon }}</span>
          <span class="next-label">下一季: {{ gameStore.nextSeasonConfig.name }}</span>
        </div>
      </div>
    </div>

    <div class="season-progress-container">
      <div class="season-progress-bar">
        <div
          v-for="(season, index) in seasons"
          :key="season.key"
          class="season-segment"
          :class="{
            active: currentSeasonIndex === index,
            passed: currentSeasonIndex > index
          }"
          :style="{ width: '25%' }"
        >
          <el-tooltip
            :content="getSeasonTooltip(season.key)"
            placement="bottom"
            :show-after="200"
          >
            <div class="segment-content">
              <span class="segment-icon">{{ season.icon }}</span>
              <span class="segment-name">{{ season.name }}</span>
            </div>
          </el-tooltip>
        </div>
        <div
          class="progress-indicator"
          :style="{ left: progressIndicatorLeft }"
        ></div>
      </div>
    </div>

    <div class="player-list">
      <div
        v-for="pid in gameStore.gameState?.playerOrder"
        :key="pid"
        class="player-badge"
        :class="{
          'is-host': pid === gameStore.gameState?.hostId,
          'is-me': pid === gameStore.currentPlayerId,
          'is-bankrupt': gameStore.gameState?.players[pid]?.isBankrupt,
          'is-ready': gameStore.gameState?.players[pid]?.actionsSubmitted
        }"
      >
        <span class="player-name">{{ gameStore.gameState?.players[pid]?.name }}</span>
        <el-tag v-if="pid === gameStore.gameState?.hostId" size="small" type="warning">房主</el-tag>
        <el-tag v-if="gameStore.gameState?.players[pid]?.isBankrupt" size="small" type="danger">破产</el-tag>
        <el-tag v-else-if="gameStore.gameState?.players[pid]?.actionsSubmitted" size="small" type="success">已准备</el-tag>
      </div>
    </div>

    <div class="actions">
      <el-button
        v-if="gameStore.isHost && gameStore.gameState?.phase === 'waiting'"
        type="success"
        @click="startGame"
      >
        🚀 开始游戏
      </el-button>
      <el-button v-if="gameStore.gameState?.phase === 'waiting'" @click="copyRoomId">
        📋 复制房间号
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { socket } from '../services/socket';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../stores/game';
import { Season } from '../types/game';

const gameStore = useGameStore();
const { gameState } = storeToRefs(gameStore);

const seasons = [
  { key: Season.SPRING, name: '春', icon: '🌸' },
  { key: Season.SUMMER, name: '夏', icon: '☀️' },
  { key: Season.AUTUMN, name: '秋', icon: '🍂' },
  { key: Season.WINTER, name: '冬', icon: '❄️' }
];

const currentSeasonIndex = computed(() => {
  if (!gameState.value) return 0;
  return seasons.findIndex(s => s.key === gameState.value!.season);
});

const progressIndicatorLeft = computed(() => {
  if (!gameState.value) return '0%';
  const turnsPerYear = 4;
  const currentTurnInYear = (gameState.value.turn - 1) % turnsPerYear;
  const progress = currentSeasonIndex.value * 25 + ((currentTurnInYear + 1) / turnsPerYear) * 25;
  return `${Math.min(progress, 98)}%`;
});

const currentLight = computed(() => gameStore.seasonConfig.light);
const currentTemp = computed(() => 20 + gameStore.seasonConfig.tempModifier);

function getSeasonTooltip(seasonKey: string): string {
  const seasonDescriptions: { [key: string]: string } = {
    [Season.SPRING]: '春季: 光照60, 温度20°C, 光照适中，温度适宜，植物生长开始活跃',
    [Season.SUMMER]: '夏季: 光照90, 温度30°C, 光照充足，高温，植物生长快但水分消耗大',
    [Season.AUTUMN]: '秋季: 光照50, 温度15°C, 光照减少，温度下降，部分植物进入休眠准备',
    [Season.WINTER]: '冬季: 光照30, 温度5°C, 光照不足，低温，大部分植物生长缓慢或休眠'
  };
  return seasonDescriptions[seasonKey] || '';
}

function startGame() {
  socket.value?.emit('start_game');
}

function copyRoomId() {
  if (gameState.value?.id) {
    navigator.clipboard.writeText(gameState.value.id);
    ElMessage.success('房间号已复制');
  }
}
</script>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: rgba(0, 0, 0, 0.4);
  color: white;
  gap: 20px;
  flex-wrap: wrap;
}

.game-info {
  display: flex;
  align-items: center;
  gap: 20px;
  font-size: 16px;
  font-weight: 500;
}

.room-id {
  font-family: monospace;
  background: rgba(255, 255, 255, 0.1);
  padding: 4px 10px;
  border-radius: 6px;
}

.turn {
  background: rgba(255, 255, 255, 0.1);
  padding: 4px 10px;
  border-radius: 6px;
}

.weather-forecast {
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(255, 255, 255, 0.1);
  padding: 8px 16px;
  border-radius: 12px;
}

.current-season {
  display: flex;
  align-items: center;
  gap: 10px;
}

.season-icon {
  font-size: 28px;
}

.season-info {
  display: flex;
  flex-direction: column;
}

.season-name {
  font-size: 16px;
  font-weight: bold;
}

.season-params {
  display: flex;
  gap: 12px;
  font-size: 12px;
  opacity: 0.9;
  margin-top: 2px;
}

.param {
  display: flex;
  align-items: center;
  gap: 2px;
}

.next-season-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 12px;
  border-left: 1px solid rgba(255, 255, 255, 0.2);
}

.arrow {
  font-size: 18px;
  opacity: 0.6;
}

.next-season-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.next-icon {
  font-size: 20px;
}

.next-label {
  opacity: 0.85;
}

.season-progress-container {
  flex: 1;
  min-width: 200px;
  max-width: 400px;
}

.season-progress-bar {
  position: relative;
  display: flex;
  height: 44px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
}

.season-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
  cursor: pointer;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.season-segment:last-child {
  border-right: none;
}

.season-segment:hover {
  background: rgba(255, 255, 255, 0.1);
}

.season-segment.active {
  background: linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%);
}

.season-segment.passed {
  background: rgba(76, 175, 80, 0.3);
}

.segment-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.segment-icon {
  font-size: 18px;
}

.segment-name {
  font-size: 11px;
  font-weight: 500;
}

.progress-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  background: #FFD700;
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.8);
  transition: left 0.5s ease;
  transform: translateX(-50%);
}

.player-list {
  flex: 1;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  min-width: 200px;
}

.player-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  font-size: 14px;
  border: 2px solid transparent;
  transition: all 0.3s;
}

.player-badge.is-me {
  border-color: #4CAF50;
  background: rgba(76, 175, 80, 0.2);
}

.player-badge.is-bankrupt {
  opacity: 0.5;
  text-decoration: line-through;
}

.player-badge.is-ready {
  border-color: #8BC34A;
}

.player-name {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions {
  display: flex;
  gap: 8px;
}
</style>
