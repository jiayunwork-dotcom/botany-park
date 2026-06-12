<template>
  <div class="player-panel panel-card">
    <div class="panel-header">
      <h3>👤 我的信息</h3>
    </div>
    <div class="panel-body">
      <div class="player-name">{{ player?.name }}</div>
      <div class="money" :class="{ negative: (player?.money || 0) < 0 }">
        💰 {{ player?.money?.toLocaleString() || 0 }} 金币
      </div>

      <el-divider />

      <div class="stat-row">
        <span>🎫 门票价格</span>
        <el-input-number
          v-model="ticketPrice"
          :min="10"
          :max="200"
          size="small"
          :disabled="!canEdit"
          @change="updateTicket"
        />
      </div>

      <div class="stat-row">
        <span>🌱 植物数量</span>
        <span class="stat-value">{{ plantCount }}</span>
      </div>

      <div class="stat-row">
        <span>🧬 已发现物种</span>
        <span class="stat-value">{{ player?.discoveredSpecies?.length || 0 }}</span>
      </div>

      <div class="stat-row">
        <span>🔬 进行中研究</span>
        <span class="stat-value">{{ player?.researchProjects?.length || 0 }}</span>
      </div>

      <el-divider />

      <div class="section-title">种子库存</div>
      <div class="seed-inventory">
        <div
          v-for="[speciesId, count] of seedEntries"
          :key="speciesId"
          class="seed-chip"
          :title="gameStore.allSpecies[speciesId]?.description"
        >
          <span>{{ gameStore.allSpecies[speciesId]?.icon }}</span>
          <span>{{ count }}</span>
        </div>
        <div v-if="seedEntries.length === 0" class="empty">
          暂无种子
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useGameStore } from '../stores/game';

const gameStore = useGameStore();

const player = computed(() => gameStore.currentPlayer);
const canEdit = computed(() => gameStore.gameState?.phase === 'playing' && !gameStore.isMyTurnReady && !player.value?.isBankrupt);

const ticketPrice = ref(player.value?.ticketPrice || 50);

watch(() => player.value?.ticketPrice, (val) => {
  if (val !== undefined) ticketPrice.value = val;
});

const plantCount = computed(() => {
  if (!player.value) return 0;
  let count = 0;
  for (const row of player.value.plots) {
    for (const plot of row) {
      if (plot.plant && plot.plant.health > 0) count++;
    }
  }
  return count;
});

const seedEntries = computed(() => {
  if (!player.value?.ownedSeeds) return [];
  return Object.entries(player.value.ownedSeeds).filter(([_, c]) => (c as number) > 0);
});

function updateTicket(val: number) {
  gameStore.addPendingAction({
    type: 'set_ticket',
    data: { price: val }
  });
}
</script>

<style scoped>
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
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
}

.panel-body {
  padding: 12px 16px;
}

.player-name {
  font-size: 18px;
  font-weight: bold;
  color: #333;
  margin-bottom: 8px;
}

.money {
  font-size: 20px;
  font-weight: bold;
  color: #ff9800;
}

.money.negative {
  color: #f44336;
}

.stat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8px 0;
  font-size: 13px;
}

.stat-value {
  font-weight: bold;
  color: #2d5a27;
}

.section-title {
  font-size: 13px;
  font-weight: bold;
  color: #2d5a27;
  margin-bottom: 8px;
}

.seed-inventory {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.seed-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: #e8f5e9;
  border-radius: 12px;
  font-size: 12px;
}

.empty {
  font-size: 12px;
  color: #999;
  text-align: center;
  padding: 8px;
}
</style>
