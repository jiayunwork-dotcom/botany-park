<template>
  <div class="plot-action-dialog">
    <div class="plot-info">
      <h4>地块信息 ({{ plot.x }}, {{ plot.y }})</h4>
      <p>类型: {{ getPlotTypeName(plot.type) }} {{ getPlotIcon(plot.type) }}</p>
      <div class="climate-info">
        <span>☀️ {{ plot.climate.light }}</span>
        <span>💧 {{ plot.climate.humidity }}</span>
        <span>pH {{ plot.climate.ph }}</span>
        <span>💨 {{ plot.climate.wind }}</span>
      </div>
    </div>

    <el-divider />

    <div v-if="plot.plant" class="plant-info">
      <h4>当前植物</h4>
      <div class="plant-header">
        <span class="plant-icon">{{ getPlantIcon(plot.plant.speciesId) }}</span>
        <span class="plant-name">{{ getPlantName(plot.plant.speciesId) }}</span>
      </div>
      <div class="plant-stats">
        <el-progress
          :percentage="plot.plant.health"
          :status="getHealthStatus(plot.plant.health)"
          :stroke-width="8"
        />
        <p>生长进度: {{ Math.round((plot.plant.biomass / plot.plant.maxBiomass) * 100) }}%</p>
        <p>年龄: {{ plot.plant.age }} 回合</p>
        <p v-if="plot.plant.isBlooming" style="color: #e91e63;">🌸 正在开花！</p>
        <div v-if="plot.plant.recoveryState?.isActive" class="recovery-info">
          <span class="recovery-badge">➕ 恢复中</span>
          <span class="recovery-detail">每回合恢复 {{ plot.plant.recoveryState.recoveryPerTurn }} 健康值</span>
        </div>
      </div>

      <div v-if="plot.plant.insurance" class="insurance-info">
        <div class="insurance-header">
          <span>🛡️ 保险状态</span>
          <el-tag :type="plot.plant.insurance.status === 'active' ? 'success' : 'info'" size="small">
            {{ plot.plant.insurance.status === 'active' ? '已投保' : '已过期' }}
          </el-tag>
        </div>
        <div class="insurance-detail">
          <p>保额: 💰 {{ plot.plant.insurance.insuredValue }}</p>
          <p>赔付比例: {{ Math.round(plot.plant.insurance.payoutRate * 100) }}%</p>
          <p>保障期限: 第 {{ plot.plant.insurance.startTurn }} ~ {{ plot.plant.insurance.endTurn }} 回合</p>
          <p>剩余: {{ Math.max(0, plot.plant.insurance.endTurn - (gameStore.gameState?.turn || 0)) }} 回合</p>
        </div>
      </div>

      <div v-else class="insurance-buy">
        <div class="insurance-header">
          <span>🛡️ 植物保险</span>
        </div>
        <div class="insurance-quote" v-if="insuranceQuote">
          <p>植物市值: 💰 {{ insuranceQuote.plantValue }}</p>
          <p>保费: 💰 {{ insuranceQuote.premium }} (市值的15%)</p>
          <p>赔付: 市值的 80%</p>
          <p>保障期限: 5 回合</p>
        </div>
        <el-button
          type="primary"
          @click="doPurchaseInsurance"
          :disabled="!canBuyInsurance || isBuying"
          :loading="isBuying"
          style="width: 100%; margin-top: 8px;"
        >
          {{ isBuying ? '购买中...' : '购买保险' }}
        </el-button>
      </div>

      <el-button type="danger" @click="doRemove" style="margin-top: 10px;">
        🗑️ 移除植物 (可回收部分金币)
      </el-button>
    </div>

    <div v-else class="actions-section">
      <h4>可执行操作</h4>

      <el-collapse>
        <el-collapse-item title="🌱 种植植物" name="plant">
          <div class="seed-list">
            <div v-if="Object.keys(availableSeeds).length === 0" class="empty">
              没有可用的种子，请到商店购买
            </div>
            <div
              v-for="[speciesId, count] of Object.entries(availableSeeds)"
              :key="speciesId"
              class="seed-item"
              :class="{ disabled: !canPlantHere(speciesId) }"
              @click="canPlantHere(speciesId) && doPlant(speciesId)"
            >
              <span class="seed-icon">{{ gameStore.allSpecies[speciesId]?.icon }}</span>
              <div class="seed-info">
                <span class="seed-name">{{ gameStore.allSpecies[speciesId]?.name }}</span>
                <span class="seed-count">x{{ count }}</span>
              </div>
              <el-tag v-if="!canPlantHere(speciesId)" size="small" type="danger">不适配</el-tag>
            </div>
          </div>
        </el-collapse-item>

        <el-collapse-item title="🔧 改造地块" name="upgrade">
          <div class="upgrade-list">
            <div
              v-for="(info, type) in upgradeOptions"
              :key="type"
              class="upgrade-item"
              :class="{ disabled: player.money < info.cost }"
              @click="player.money >= info.cost && doUpgrade(String(type))"
            >
              <span class="upgrade-icon">{{ getPlotIcon(String(type)) }}</span>
              <div class="upgrade-info">
                <span class="upgrade-name">{{ getPlotTypeName(String(type)) }}</span>
                <span class="upgrade-cost">💰 {{ info.cost }} ({{ info.turns }}回合)</span>
              </div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>

    <div class="dialog-footer">
      <el-button @click="$emit('close')">关闭</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { Plot, PlayerAction, PlotType } from '../types/game';
import { useGameStore } from '../stores/game';

const props = defineProps<{
  plot: Plot;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'action', action: PlayerAction): void;
}>();

const gameStore = useGameStore();

const player = computed(() => gameStore.currentPlayer!);

const availableSeeds = computed(() => {
  const seeds: { [id: string]: number } = {};
  for (const [id, count] of Object.entries(player.value.ownedSeeds || {})) {
    if (count > 0) seeds[id] = count;
  }
  return seeds;
});

const upgradeOptions: any = {
  greenhouse: { cost: 500, turns: 1 },
  pond: { cost: 800, turns: 1 },
  rock: { cost: 300, turns: 1 },
  path: { cost: 150, turns: 1 },
  exhibition: { cost: 600, turns: 1 },
  pavilion: { cost: 400, turns: 1 }
};

const plotTypeNames: any = {
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

function getPlotTypeName(type: string) {
  return plotTypeNames[type] || type;
}

function getPlotIcon(type: string) {
  return plotTypeIcons[type] || '🟫';
}

function getPlantIcon(speciesId: string) {
  return gameStore.allSpecies[speciesId]?.icon || '🌱';
}

function getPlantName(speciesId: string) {
  return gameStore.allSpecies[speciesId]?.name || '未知植物';
}

function getHealthStatus(health: number) {
  if (health >= 80) return 'success';
  if (health >= 50) return '';
  if (health >= 20) return 'warning';
  return 'exception';
}

function canPlantHere(speciesId: string): boolean {
  const species = gameStore.allSpecies[speciesId];
  if (!species) return false;

  if (props.plot.type === 'path' || props.plot.type === 'exhibition' || props.plot.type === 'pavilion') {
    return false;
  }
  if (species.category === 'aquatic' && props.plot.type !== 'pond') return false;
  if (props.plot.type === 'pond' && species.category !== 'aquatic') return false;
  if (props.plot.constructionTurnsLeft > 0) return false;

  return true;
}

function doPlant(speciesId: string) {
  emit('action', {
    type: 'plant',
    data: { x: props.plot.x, y: props.plot.y, speciesId }
  });
}

function doRemove() {
  emit('action', {
    type: 'remove',
    data: { x: props.plot.x, y: props.plot.y }
  });
}

function doUpgrade(newType: string) {
  emit('action', {
    type: 'upgrade',
    data: { x: props.plot.x, y: props.plot.y, newType: newType as PlotType }
  });
}

const isBuying = ref(false);

const insuranceQuote = computed(() => {
  if (!props.plot.plant) return null;
  const plant = props.plot.plant;
  const species = gameStore.allSpecies[plant.speciesId];
  if (!species) return null;

  const growthRatio = plant.biomass / plant.maxBiomass;
  const plantValue = Math.round(species.baseValue * (0.3 + growthRatio * 0.7));
  const premium = Math.round(plantValue * 0.15);

  return {
    plantValue,
    premium
  };
});

const canBuyInsurance = computed(() => {
  if (!props.plot.plant) return false;
  if (props.plot.plant.insurance && props.plot.plant.insurance.status === 'active') return false;
  if (!insuranceQuote.value) return false;
  return player.value.money >= insuranceQuote.value.premium;
});

async function doPurchaseInsurance() {
  if (!canBuyInsurance.value) return;
  if (isBuying.value) return;

  isBuying.value = true;
  try {
    const result = await gameStore.purchaseInsurance(props.plot.x, props.plot.y);
    if (result.success) {
      ElMessage.success('保险购买成功！');
    } else {
      ElMessage.error(result.error || '购买失败');
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '购买失败');
  } finally {
    isBuying.value = false;
  }
}
</script>

<style scoped>
.plot-action-dialog {
  padding: 4px;
}

.plot-info h4,
.plant-info h4,
.actions-section h4 {
  margin: 0 0 8px 0;
  color: #2d5a27;
}

.climate-info {
  display: flex;
  gap: 12px;
  font-size: 13px;
  color: #666;
  margin-top: 4px;
}

.plant-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.plant-icon {
  font-size: 32px;
}

.plant-name {
  font-size: 18px;
  font-weight: bold;
}

.plant-stats p {
  margin: 6px 0;
  font-size: 14px;
  color: #555;
}

.insurance-info,
.insurance-buy {
  margin-top: 12px;
  padding: 10px 12px;
  background: #e3f2fd;
  border-radius: 8px;
  border-left: 4px solid #2196f3;
}

.insurance-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: bold;
  font-size: 14px;
  color: #1565c0;
}

.insurance-detail p,
.insurance-quote p {
  margin: 4px 0;
  font-size: 12px;
  color: #555;
}

.seed-list,
.upgrade-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 250px;
  overflow-y: auto;
}

.seed-item,
.upgrade-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.seed-item:hover:not(.disabled),
.upgrade-item:hover:not(.disabled) {
  background: #e8f5e9;
  transform: translateX(4px);
}

.seed-item.disabled,
.upgrade-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.seed-icon,
.upgrade-icon {
  font-size: 24px;
}

.seed-info,
.upgrade-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.seed-name,
.upgrade-name {
  font-size: 14px;
  font-weight: 500;
}

.seed-count,
.upgrade-cost {
  font-size: 12px;
  color: #888;
}

.empty {
  text-align: center;
  color: #999;
  padding: 20px;
}

.dialog-footer {
  margin-top: 16px;
  text-align: right;
}

.recovery-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  padding: 6px 10px;
  background: #e8f5e9;
  border-radius: 6px;
  border-left: 3px solid #4caf50;
}

.recovery-badge {
  font-size: 13px;
  font-weight: bold;
  color: #2e7d32;
}

.recovery-detail {
  font-size: 12px;
  color: #555;
}
</style>
