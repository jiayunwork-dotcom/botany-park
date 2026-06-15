<template>
  <div class="turn-events panel-card">
    <div class="panel-header">
      <h3>📜 回合事件</h3>
      <el-button size="small" text @click="clearEvents">清空</el-button>
    </div>

    <div v-if="gameStore.currentWeather" class="weather-section">
      <div class="weather-display" :class="{ disaster: gameStore.currentWeather.severity > 0 }">
        <span class="weather-icon">{{ gameStore.currentWeather.icon }}</span>
        <div class="weather-info">
          <div class="weather-name">{{ gameStore.currentWeather.name }}</div>
          <div class="weather-desc">{{ gameStore.currentWeather.description }}</div>
        </div>
        <el-tag v-if="gameStore.currentWeather.severity > 0" type="danger" size="small">
          灾害等级 {{ gameStore.currentWeather.severity }}
        </el-tag>
        <el-tag v-else type="success" size="small">
          正常
        </el-tag>
      </div>
    </div>

    <div class="panel-body events-list">
      <div v-if="gameStore.turnEvents.length === 0" class="empty">
        暂无事件
      </div>
      <div
        v-for="(event, index) in gameStore.turnEvents"
        :key="index"
        class="event-item"
        :class="getEventClass(event)"
      >
        {{ event }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useGameStore } from '../stores/game';

const gameStore = useGameStore();

function clearEvents() {
  gameStore.clearTurnEvents();
}

function getEventClass(event: string): string {
  if (event.includes('灾害') || event.includes('枯死') || event.includes('受损')) {
    return 'event-disaster';
  }
  if (event.includes('保险') || event.includes('理赔')) {
    return 'event-insurance';
  }
  if (event.includes('收入') || event.includes('获得') || event.includes('奖励')) {
    return 'event-positive';
  }
  return '';
}
</script>

<style scoped>
.weather-section {
  padding: 10px 12px;
  border-bottom: 1px solid #eee;
  background: #fafafa;
}

.weather-display {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #e8f5e9;
  border-radius: 8px;
  border-left: 4px solid #4caf50;
}

.weather-display.disaster {
  background: #ffebee;
  border-left-color: #f44336;
}

.weather-icon {
  font-size: 32px;
}

.weather-info {
  flex: 1;
}

.weather-name {
  font-weight: bold;
  font-size: 14px;
  color: #333;
}

.weather-desc {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
}

.events-list {
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
}

.event-item {
  font-size: 12px;
  padding: 6px 8px;
  background: #f5f5f5;
  border-radius: 4px;
  line-height: 1.4;
  border-left: 3px solid #4CAF50;
}

.event-disaster {
  background: #ffebee;
  border-left-color: #f44336;
  color: #c62828;
}

.event-insurance {
  background: #e3f2fd;
  border-left-color: #2196f3;
  color: #1565c0;
}

.event-positive {
  background: #e8f5e9;
  border-left-color: #4caf50;
  color: #2e7d32;
}

.empty {
  font-size: 12px;
  color: #999;
  text-align: center;
  padding: 20px;
}

.panel-card {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.panel-header {
  background: linear-gradient(135deg, #2d5a27, #4a7c39);
  color: white;
  padding: 10px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
}

.panel-body {
  padding: 0;
}
</style>
