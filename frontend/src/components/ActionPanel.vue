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

    <div class="action-buttons">
      <el-button
        type="primary"
        plain
        @click="showSuitabilityDialog = true"
        :disabled="gameStore.gameState?.phase !== 'playing'"
      >
        📊 环境适宜度速查
      </el-button>

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

    <el-dialog
      v-model="showSuitabilityDialog"
      title="🌱 种子环境适宜度速查"
      width="600px"
    >
      <div class="suitability-header">
        <div class="current-season-info">
          <span class="season-icon">{{ gameStore.seasonConfig.icon }}</span>
          <span class="season-text">当前季节: {{ gameStore.seasonConfig.name }}</span>
        </div>
        <div class="hint">
          评分基于当前季节环境和您的地块微气候计算
        </div>
      </div>

      <div v-if="suitabilityList.length === 0" class="empty-state">
        <div class="empty-icon">🌱</div>
        <div class="empty-text">您还没有购买任何种子</div>
        <div class="empty-hint">前往种子商店购买种子后查看</div>
      </div>

      <div v-else class="suitability-table-container">
        <table class="suitability-table">
          <thead>
            <tr>
              <th>种子</th>
              <th>名称</th>
              <th>适宜度评分</th>
              <th>推荐等级</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in suitabilityList"
              :key="item.speciesId"
              :class="{ 'low-score': item.score < 50 }"
            >
              <td class="seed-icon">{{ item.icon }}</td>
              <td class="seed-name">{{ item.speciesName }}</td>
              <td class="score-cell">
                <div class="score-bar">
                  <div
                    class="score-fill"
                    :class="getScoreClass(item.score)"
                    :style="{ width: `${item.score}%` }"
                  ></div>
                  <span class="score-text">{{ item.score }}分</span>
                </div>
              </td>
              <td class="recommendation-cell">
                <el-tag
                  :type="getRecommendationTagType(item.score)"
                  size="small"
                >
                  {{ item.recommendation }}
                </el-tag>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="legend">
          <div class="legend-item">
            <span class="legend-color excellent"></span>
            <span>80-100分: 非常适合</span>
          </div>
          <div class="legend-item">
            <span class="legend-color good"></span>
            <span>60-79分: 适合</span>
          </div>
          <div class="legend-item">
            <span class="legend-color normal"></span>
            <span>50-59分: 一般</span>
          </div>
          <div class="legend-item">
            <span class="legend-color poor"></span>
            <span>0-49分: 不推荐</span>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="showSuitabilityDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../stores/game';
import type { PlayerAction } from '../types/game';

defineEmits<{
  (e: 'submit'): void;
}>();

const gameStore = useGameStore();
const { currentPlayer } = storeToRefs(gameStore);

const showSuitabilityDialog = ref(false);

const suitabilityList = computed(() => {
  return gameStore.getSeedSuitabilityList();
});

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

function getScoreClass(score: number): string {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 50) return 'normal';
  return 'poor';
}

function getRecommendationTagType(score: number): 'success' | 'primary' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 60) return 'primary';
  if (score >= 50) return 'warning';
  return 'danger';
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

.empty {
  font-size: 13px;
  color: #999;
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

.action-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.submit-section {
  flex-shrink: 0;
}

.ready-status {
  font-size: 14px;
}

.suitability-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 16px;
}

.current-season-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 500;
}

.season-icon {
  font-size: 24px;
}

.season-text {
  color: #333;
}

.hint {
  font-size: 12px;
  color: #888;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-text {
  font-size: 16px;
  color: #666;
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 13px;
  color: #999;
}

.suitability-table-container {
  max-height: 400px;
  overflow-y: auto;
}

.suitability-table {
  width: 100%;
  border-collapse: collapse;
}

.suitability-table th {
  background: #fafafa;
  padding: 12px;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  color: #666;
  border-bottom: 2px solid #e0e0e0;
}

.suitability-table td {
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
  font-size: 14px;
}

.suitability-table tr.low-score {
  background: #fff5f5;
}

.suitability-table tr:hover {
  background: #f9f9f9;
}

.suitability-table tr.low-score:hover {
  background: #ffeaea;
}

.seed-icon {
  font-size: 24px;
  width: 40px;
  text-align: center;
}

.seed-name {
  font-weight: 500;
  color: #333;
}

.score-cell {
  width: 180px;
}

.score-bar {
  position: relative;
  height: 24px;
  background: #f0f0f0;
  border-radius: 12px;
  overflow: hidden;
}

.score-fill {
  height: 100%;
  border-radius: 12px;
  transition: width 0.5s ease;
}

.score-fill.excellent {
  background: linear-gradient(90deg, #4CAF50, #8BC34A);
}

.score-fill.good {
  background: linear-gradient(90deg, #2196F3, #03A9F4);
}

.score-fill.normal {
  background: linear-gradient(90deg, #FF9800, #FFC107);
}

.score-fill.poor {
  background: linear-gradient(90deg, #F44336, #E91E63);
}

.score-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 12px;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.recommendation-cell {
  width: 120px;
}

.legend {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #666;
}

.legend-color {
  width: 16px;
  height: 16px;
  border-radius: 4px;
}

.legend-color.excellent {
  background: linear-gradient(90deg, #4CAF50, #8BC34A);
}

.legend-color.good {
  background: linear-gradient(90deg, #2196F3, #03A9F4);
}

.legend-color.normal {
  background: linear-gradient(90deg, #FF9800, #FFC107);
}

.legend-color.poor {
  background: linear-gradient(90deg, #F44336, #E91E63);
}
</style>
