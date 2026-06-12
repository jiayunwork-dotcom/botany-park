<template>
  <div class="other-players">
    <div class="player-tabs">
      <el-radio-group v-model="selectedPlayerId" size="small">
        <el-radio-button
          v-for="pid in otherPlayerIds"
          :key="pid"
          :label="pid"
        >
          {{ gameStore.gameState?.players[pid]?.name }}
          {{ gameStore.gameState?.players[pid]?.isBankrupt ? '💀' : '' }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <div v-if="selectedPlayer && selectedPlayer.plots" class="player-view">
      <div class="player-stats">
        <span>💰 {{ selectedPlayer.money?.toLocaleString() }}</span>
        <span>🎫 {{ selectedPlayer.ticketPrice }}</span>
        <span>🌱 {{ countPlants(selectedPlayer) }} 株</span>
        <span class="note">（延迟1回合快照）</span>
      </div>
      <GameMapViewOnly :player="selectedPlayer" />
    </div>

    <div v-else class="empty">
      {{ otherPlayerIds.length === 0 ? '暂无其他玩家' : '请选择要查看的玩家' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useGameStore } from '../stores/game';
import GameMapViewOnly from './GameMapViewOnly.vue';
import type { PlayerState } from '../types/game';

const gameStore = useGameStore();

const otherPlayerIds = computed(() => {
  if (!gameStore.gameState) return [];
  return gameStore.gameState.playerOrder.filter(
    pid => pid !== gameStore.currentPlayerId
  );
});

const selectedPlayerId = ref('');

const selectedPlayer = computed<PlayerState | null>(() => {
  if (!selectedPlayerId.value || !gameStore.gameState) return null;
  return gameStore.gameState.players[selectedPlayerId.value] || null;
});

function countPlants(player: PlayerState): number {
  let count = 0;
  for (const row of player.plots || []) {
    for (const plot of row) {
      if (plot.plant && plot.plant.health > 0) count++;
    }
  }
  return count;
}
</script>

<style scoped>
.other-players {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.player-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.player-stats {
  display: flex;
  gap: 16px;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 8px;
  font-size: 14px;
  margin-bottom: 8px;
}

.note {
  font-size: 12px;
  color: #999;
  margin-left: auto;
}
</style>
