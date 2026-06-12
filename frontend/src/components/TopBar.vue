<template>
  <div class="top-bar">
    <div class="game-info">
      <span class="room-id">房间号: {{ gameStore.gameState?.id.slice(0, 8) }}</span>
      <span class="season" :class="`season-${gameStore.gameState?.season}`">
        {{ seasonIcon }} {{ seasonName }}
      </span>
      <span class="turn">
        回合 {{ gameStore.gameState?.turn }} / {{ gameStore.gameState?.maxTurns }}
      </span>
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
import { useGameStore } from '../stores/game';

const gameStore = useGameStore();

const seasonMap: any = {
  spring: { icon: '🌸', name: '春季' },
  summer: { icon: '☀️', name: '夏季' },
  autumn: { icon: '🍂', name: '秋季' },
  winter: { icon: '❄️', name: '冬季' }
};

const seasonIcon = computed(() => seasonMap[gameStore.gameState?.season || 'spring']?.icon || '🌸');
const seasonName = computed(() => seasonMap[gameStore.gameState?.season || 'spring']?.name || '春季');

function startGame() {
  socket.value?.emit('start_game');
}

function copyRoomId() {
  if (gameStore.gameState?.id) {
    navigator.clipboard.writeText(gameStore.gameState.id);
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

.player-list {
  flex: 1;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
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
