<template>
  <div class="turn-events panel-card">
    <div class="panel-header">
      <h3>📜 回合事件</h3>
      <el-button size="small" text @click="clearEvents">清空</el-button>
    </div>
    <div class="panel-body events-list">
      <div v-if="gameStore.turnEvents.length === 0" class="empty">
        暂无事件
      </div>
      <div
        v-for="(event, index) in gameStore.turnEvents"
        :key="index"
        class="event-item"
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
</script>

<style scoped>
.events-list {
  max-height: 200px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.event-item {
  font-size: 12px;
  padding: 6px 8px;
  background: #f5f5f5;
  border-radius: 4px;
  line-height: 1.4;
  border-left: 3px solid #4CAF50;
}
</style>
