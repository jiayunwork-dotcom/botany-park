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

      <div class="section-title">🛡️ 保险</div>
      <div class="insurance-summary">
        <div class="insurance-stat">
          <span>已投保</span>
          <span class="stat-value">{{ gameStore.activeInsurances.length }} 株</span>
        </div>
      </div>

      <div v-if="gameStore.myInsurances.length > 0" class="insurance-list">
        <div
          v-for="item in gameStore.myInsurances"
          :key="item.policy.id"
          class="insurance-item"
          :class="{ expired: item.policy.status === 'expired' }"
        >
          <span class="insurance-icon">{{ gameStore.allSpecies[item.policy.speciesId]?.icon }}</span>
          <div class="insurance-info">
            <div class="insurance-name">{{ item.speciesName }} ({{ item.plot.x }},{{ item.plot.y }})</div>
            <div class="insurance-detail">
              保额 {{ item.policy.insuredValue }} · 剩余 {{ item.policy.endTurn - (gameStore.gameState?.turn || 0) }} 回合
            </div>
          </div>
          <el-tag v-if="item.policy.status === 'active'" type="success" size="small">有效</el-tag>
          <el-tag v-else type="info" size="small">已过期</el-tag>
        </div>
      </div>
      <div v-else class="empty">
        暂无保险，点击植物可购买
      </div>

      <el-button
        type="warning"
        size="small"
        style="width: 100%; margin-top: 8px;"
        :disabled="!canEdit || isBatchBuying"
        :loading="isBatchBuying"
        @click="handleBatchInsurance"
      >
        🛡️ 一键投保
      </el-button>

      <el-collapse class="claim-collapse">
        <el-collapse-item title="📋 理赔记录" name="claims">
          <div v-if="gameStore.claimRecords.length > 0" class="claim-list">
            <div
              v-for="(record, idx) in gameStore.claimRecords"
              :key="idx"
              class="claim-item"
            >
              <div class="claim-main">
                <span class="claim-disaster">{{ getDisasterIcon(record.disasterType) }}</span>
                <div class="claim-info">
                  <span class="claim-species">{{ record.speciesName }}</span>
                  <span class="claim-turn">第{{ record.turn }}回合</span>
                </div>
                <span class="claim-payout">+{{ record.payoutAmount }}</span>
              </div>
            </div>
          </div>
          <div v-else class="empty">暂无理赔记录</div>

          <div v-if="gameStore.claimRecords.length > 0" class="claim-stats">
            <div class="claim-stat-row">
              <span>总投保次数</span>
              <span class="stat-value">{{ gameStore.insuranceStats.totalPolicies }}</span>
            </div>
            <div class="claim-stat-row">
              <span>总保费支出</span>
              <span class="stat-value">{{ gameStore.insuranceStats.totalPremiumsPaid }}</span>
            </div>
            <div class="claim-stat-row">
              <span>总理赔收入</span>
              <span class="stat-value">{{ gameStore.insuranceStats.totalClaimsReceived }}</span>
            </div>
            <div class="claim-stat-row">
              <span>净损益</span>
              <span class="stat-value" :class="{ positive: insuranceNetBalance > 0, negative: insuranceNetBalance < 0 }">
                {{ insuranceNetBalance >= 0 ? '+' : '' }}{{ insuranceNetBalance }}
              </span>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>

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

    <el-dialog v-model="batchDialogVisible" title="一键投保确认" width="420px" :close-on-click-modal="false">
      <div v-if="batchPreview.length > 0" class="batch-preview">
        <p class="batch-summary">将为 {{ batchPreview.length }} 株未投保植物购买保险</p>
        <div class="batch-list">
          <div v-for="item in batchPreview" :key="`${item.x}-${item.y}`" class="batch-item">
            <span>{{ item.speciesName }} ({{ item.x }},{{ item.y }})</span>
            <span>💰 {{ item.premium }}</span>
          </div>
        </div>
        <div class="batch-total">
          预估保费总计: 💰 {{ batchPreviewTotal }}
        </div>
      </div>
      <div v-else class="empty">没有需要投保的植物</div>
      <template #footer>
        <el-button @click="batchDialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="batchPreview.length === 0" @click="confirmBatchInsurance">确认投保</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
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

const insuranceNetBalance = computed(() => {
  const stats = gameStore.insuranceStats;
  return stats.totalClaimsReceived - stats.totalPremiumsPaid;
});

const isBatchBuying = ref(false);
const batchDialogVisible = ref(false);

const batchPreview = computed(() => {
  if (!player.value) return [];
  const items: { x: number; y: number; speciesName: string; premium: number }[] = [];
  for (const row of player.value.plots) {
    for (const plot of row) {
      if (!plot.plant) continue;
      if (plot.plant.insurance && plot.plant.insurance.status === 'active') continue;
      const species = gameStore.allSpecies[plot.plant.speciesId];
      if (!species) continue;
      const growthRatio = plot.plant.biomass / plot.plant.maxBiomass;
      const plantValue = Math.round(species.baseValue * (plot.plant.health / 100) * (0.3 + 0.7 * growthRatio));
      const premium = Math.round(plantValue * 0.15);
      items.push({ x: plot.x, y: plot.y, speciesName: species.name, premium });
    }
  }
  items.sort((a, b) => b.premium - a.premium);
  return items;
});

const batchPreviewTotal = computed(() => {
  return batchPreview.value.reduce((sum, item) => sum + item.premium, 0);
});

function getDisasterIcon(disasterType: string): string {
  const iconMap: any = {
    rainstorm: '⛈️',
    drought: '🏜️',
    frost: '🧊',
    typhoon: '🌀',
    pest: '🐛'
  };
  return iconMap[disasterType] || '🌪️';
}

function updateTicket(val: number) {
  gameStore.addPendingAction({
    type: 'set_ticket',
    data: { price: val }
  });
}

function handleBatchInsurance() {
  if (batchPreview.value.length === 0) {
    ElMessage.info('没有需要投保的植物');
    return;
  }
  batchDialogVisible.value = true;
}

async function confirmBatchInsurance() {
  isBatchBuying.value = true;
  try {
    const result = await gameStore.batchPurchaseInsurance();
    batchDialogVisible.value = false;
    if (result.insured.length > 0) {
      ElMessage.success(`成功为 ${result.insured.length} 株植物投保，保费总计 ${result.totalPremium}`);
    }
    if (result.skipped.length > 0) {
      const skippedNames = result.skipped.map(s => s.speciesName).join('、');
      ElMessage.warning(`因余额不足未能投保: ${skippedNames}`);
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '批量投保失败');
  } finally {
    isBatchBuying.value = false;
  }
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

.insurance-summary {
  margin-bottom: 8px;
}

.insurance-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.insurance-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
}

.insurance-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #e3f2fd;
  border-radius: 6px;
  border-left: 3px solid #2196f3;
}

.insurance-item.expired {
  background: #f5f5f5;
  border-left-color: #9e9e9e;
  opacity: 0.6;
}

.insurance-icon {
  font-size: 18px;
}

.insurance-info {
  flex: 1;
  min-width: 0;
}

.insurance-name {
  font-size: 12px;
  font-weight: 500;
  color: #333;
}

.insurance-detail {
  font-size: 10px;
  color: #666;
  margin-top: 2px;
}

.empty {
  font-size: 12px;
  color: #999;
  text-align: center;
  padding: 8px;
}

.claim-collapse {
  margin-top: 8px;
  border: none;
}

.claim-collapse :deep(.el-collapse-item__header) {
  font-size: 13px;
  font-weight: bold;
  color: #2d5a27;
  background: transparent;
  border: none;
  height: 32px;
  line-height: 32px;
}

.claim-collapse :deep(.el-collapse-item__wrap) {
  border: none;
  background: transparent;
}

.claim-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 150px;
  overflow-y: auto;
}

.claim-item {
  padding: 4px 8px;
  background: #fff3e0;
  border-radius: 4px;
  border-left: 3px solid #ff9800;
}

.claim-main {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.claim-disaster {
  font-size: 14px;
}

.claim-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.claim-species {
  font-weight: 500;
  color: #333;
}

.claim-turn {
  font-size: 10px;
  color: #888;
}

.claim-payout {
  font-weight: bold;
  color: #4caf50;
  font-size: 12px;
}

.claim-stats {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #e0e0e0;
}

.claim-stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 2px 0;
}

.stat-value.positive {
  color: #4caf50;
}

.stat-value.negative {
  color: #f44336;
}

.batch-preview {
  font-size: 14px;
}

.batch-summary {
  font-weight: bold;
  margin-bottom: 12px;
  color: #333;
}

.batch-list {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 12px;
}

.batch-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  background: #f5f5f5;
  border-radius: 4px;
  margin-bottom: 4px;
  font-size: 13px;
}

.batch-total {
  font-weight: bold;
  font-size: 14px;
  color: #ff9800;
  text-align: right;
}
</style>
