<template>
  <div class="action-panel">
    <div class="pending-actions">
      <span class="label">待执行操作:</span>
      <div v-if="gameStore.pendingActions.length === 0" class="empty">
        点击地图地块执行操作
      </div>
      <div
        v-for="(action, index) in gameStore.pendingActions"
        :key="index"
        class="action-tag"
      >
        {{ formatAction(action) }}
        <el-button
          size="small"
          text
          type="danger"
          @click="gameStore.removePendingAction(index)"
        >
          ✕
        </el-button>
      </div>
    </div>

    <div class="submit-section">
      <div v-if="gameStore.isMyTurnReady" class="ready-status">
        <el-tag type="success">✅ 已提交，等待其他玩家</el-tag>
      </div>
      <el-button
        v-else
        type="success"
        size="large"
        :disabled="gameStore.gameState?.phase !== 'playing'"
        @click="$emit('submit')"
      >
        ✅ 提交操作，结束本回合
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useGameStore } from '../stores/game';
import type { PlayerAction } from '../types/game';

defineEmits<{
  (e: 'submit'): void;
}>();

const gameStore = useGameStore();

const actionTypeNames: any = {
  plant: '种植',
  remove: '移除',
  upgrade: '改造',
  set_ticket: '调整门票',
  research: '科研',
  trade: '交易',
  sell_seed: '出售种子'
};

function formatAction(action: PlayerAction): string {
  const name = actionTypeNames[action.type] || action.type;
  let detail = '';

  switch (action.type) {
    case 'plant':
      const species = gameStore.allSpecies[action.data.speciesId];
      detail = `(${action.data.x},${action.data.y}) ${species?.icon} ${species?.name}`;
      break;
    case 'remove':
      detail = `(${action.data.x},${action.data.y})`;
      break;
    case 'upgrade':
      const typeNames: any = {
        normal: '普通土地', greenhouse: '温室', pond: '池塘',
        rock: '岩石区', path: '步道', exhibition: '科普展区', pavilion: '休息亭'
      };
      detail = `(${action.data.x},${action.data.y}) → ${typeNames[action.data.newType]}`;
      break;
    case 'set_ticket':
      detail = `${action.data.price} 金币`;
      break;
    case 'research':
      detail = action.data.type === 'hybrid' ? '杂交育种' : '濒危保护';
      break;
    case 'sell_seed':
      const sellSpecies = gameStore.allSpecies[action.data.speciesId];
      detail = `${sellSpecies?.icon} ${sellSpecies?.name} x${action.data.quantity}`;
      break;
  }

  return `[${name}] ${detail}`;
}
</script>

<style scoped>
.action-panel {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.pending-actions {
  flex: 1;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.label {
  font-size: 13px;
  font-weight: bold;
  color: #555;
}

.action-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #e3f2fd;
  border-radius: 16px;
  font-size: 12px;
  color: #1565c0;
}

.submit-section {
  flex-shrink: 0;
}

.ready-status {
  font-size: 14px;
}
</style>
