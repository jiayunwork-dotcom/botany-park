<template>
  <div class="trade-market">
    <div class="market-header">
      <h2>🌿 植物交易市场</h2>
      <el-button type="success" @click="showCreateDialog = true" :disabled="!canTrade">
        ＋ 发布挂单
      </el-button>
    </div>

    <div class="market-tax-bar">
      <div class="tax-info">
        <span class="tax-label">📊 交易税率：</span>
        <span class="tax-value">{{ (tradeTaxRate * 100).toFixed(0) }}%</span>
        <span class="tax-hint">（卖家支付，实收 = 总价 × 95%）</span>
      </div>
      <div class="public-funds">
        <span class="funds-label">💰 公共资金池：</span>
        <span class="funds-value">{{ publicFunds }} 金币</span>
        <span class="funds-hint">（每回合末按人头均分返还）</span>
      </div>
    </div>

    <div class="market-stats-panel">
      <div class="panel-header">
        <h3>📈 市场行情（近5回合）</h3>
        <el-select v-model="selectedStatsSpecies" size="small" placeholder="选择物种查看走势" clearable style="width: 180px;">
          <el-option
            v-for="stat in marketStats"
            :key="stat.speciesId"
            :label="`${getSpecies(stat.speciesId)?.icon || '🌱'} ${getSpecies(stat.speciesId)?.name || '未知'}`"
            :value="stat.speciesId"
          />
        </el-select>
      </div>
      <div v-if="marketStats.length === 0" class="empty-state">
        暂无交易数据
      </div>
      <div v-else class="stats-content">
        <div class="stats-overview">
          <div
            v-for="stat in marketStats.slice(0, 6)"
            :key="stat.speciesId"
            class="stat-card"
            :class="{ active: selectedStatsSpecies === stat.speciesId }"
            @click="selectedStatsSpecies = selectedStatsSpecies === stat.speciesId ? '' : stat.speciesId"
          >
            <div class="stat-icon">{{ getSpecies(stat.speciesId)?.icon }}</div>
            <div class="stat-name">{{ getSpecies(stat.speciesId)?.name }}</div>
            <div class="stat-price">💰 {{ stat.avgPrice5Turns }}</div>
            <div class="stat-volume">成交量: {{ stat.volume5Turns }}</div>
          </div>
        </div>
        <div v-if="selectedStatsSpecies && currentStat" class="chart-container">
          <div class="chart-title">
            {{ getSpecies(selectedStatsSpecies)?.name }} 价格走势
          </div>
          <div class="chart-wrapper">
            <svg :viewBox="`0 0 ${chartWidth} ${chartHeight}`" class="price-chart">
              <defs>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" style="stop-color:#67c23a;stop-opacity:0.3" />
                  <stop offset="100%" style="stop-color:#67c23a;stop-opacity:0" />
                </linearGradient>
              </defs>
              <g class="grid-lines">
                <line
                  v-for="i in 4"
                  :key="i"
                  :x1="paddingLeft"
                  :y1="paddingTop + (chartInnerHeight / 4) * (i - 1)"
                  :x2="chartWidth - paddingRight"
                  :y2="paddingTop + (chartInnerHeight / 4) * (i - 1)"
                  stroke="#e0e0e0"
                  stroke-dasharray="3,3"
                />
              </g>
              <g class="y-axis">
                <text
                  v-for="(label, i) in yAxisLabels"
                  :key="i"
                  :x="paddingLeft - 8"
                  :y="paddingTop + (chartInnerHeight / 4) * i + 4"
                  text-anchor="end"
                  class="axis-label"
                >
                  {{ label }}
                </text>
              </g>
              <g class="x-axis">
                <text
                  v-for="(point, i) in currentStat.priceHistory"
                  :key="i"
                  :x="getX(i)"
                  :y="chartHeight - paddingBottom + 18"
                  text-anchor="middle"
                  class="axis-label"
                >
                  第{{ point.turn }}回合
                </text>
              </g>
              <polyline
                :points="areaPoints"
                fill="url(#lineGradient)"
                stroke="none"
              />
              <polyline
                :points="linePoints"
                fill="none"
                stroke="#67c23a"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <g v-for="(point, i) in currentStat.priceHistory" :key="i">
                <circle
                  :cx="getX(i)"
                  :cy="getY(point.avgPrice)"
                  r="4"
                  fill="#fff"
                  stroke="#67c23a"
                  stroke-width="2"
                  class="data-point"
                  @mouseenter="hoverIndex = i"
                  @mouseleave="hoverIndex = -1"
                />
                <g v-if="hoverIndex === i" class="tooltip">
                  <rect
                    :x="getX(i) - 50"
                    :y="getY(point.avgPrice) - 45"
                    width="100"
                    height="35"
                    rx="4"
                    fill="rgba(0,0,0,0.8)"
                  />
                  <text :x="getX(i)" :y="getY(point.avgPrice) - 28" text-anchor="middle" class="tooltip-text">
                    第{{ point.turn }}回合
                  </text>
                  <text :x="getX(i)" :y="getY(point.avgPrice) - 16" text-anchor="middle" class="tooltip-text">
                    均价: {{ point.avgPrice }}
                  </text>
                  <text :x="getX(i)" :y="getY(point.avgPrice) - 4" text-anchor="middle" class="tooltip-text">
                    成交量: {{ point.volume }}
                  </text>
                </g>
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>

    <div class="market-filters">
      <el-select v-model="filterCategory" placeholder="按物种筛选" size="small" clearable style="width: 150px;">
        <el-option label="全部物种" value="" />
        <el-option
          v-for="cat in categoryList"
          :key="cat.value"
          :label="cat.label"
          :value="cat.value"
        />
      </el-select>
      <el-select v-model="sortBy" placeholder="排序方式" size="small" style="width: 140px;">
        <el-option label="单价从低到高" value="price_asc" />
        <el-option label="单价从高到低" value="price_desc" />
        <el-option label="剩余回合" value="turns_desc" />
        <el-option label="数量最多" value="quantity_desc" />
      </el-select>
    </div>

    <div class="market-section">
      <div class="section-header">
        <h3>📋 在售挂单</h3>
        <div v-if="selectedOrderIds.length > 0" class="batch-actions">
          <span class="selected-count">已选 {{ selectedOrderIds.length }} 个挂单</span>
          <span class="batch-total">总价: 💰 {{ batchTotalCost }}</span>
          <el-button
            size="small"
            type="primary"
            :disabled="!canBatchBuy"
            @click="batchBuy"
          >
            批量结算
          </el-button>
          <el-button size="small" @click="clearSelection">
            取消选择
          </el-button>
        </div>
      </div>
      <div v-if="filteredOrders.length === 0" class="empty-state">
        暂无在售挂单
      </div>
      <el-table v-else :data="filteredOrders" size="small" stripe @selection-change="handleSelectionChange" ref="orderTable">
        <el-table-column type="selection" width="45" align="center" />
        <el-table-column label="物种" width="160">
          <template #default="{ row }">
            <div class="species-cell">
              <span class="species-icon">{{ getSpecies(row.speciesId)?.icon }}</span>
              <span class="species-name">{{ getSpecies(row.speciesId)?.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="sellerName" label="卖家" width="100" />
        <el-table-column prop="quantity" label="数量" width="70" align="center" />
        <el-table-column label="单价" width="90" align="center">
          <template #default="{ row }">
            <span class="price-text">💰 {{ row.unitPrice }}</span>
          </template>
        </el-table-column>
        <el-table-column label="总价" width="100" align="center">
          <template #default="{ row }">
            <span class="total-price">💰 {{ row.unitPrice * row.quantity }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'negotiating' ? 'warning' : 'success'">
              {{ getOrderStatusName(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="剩余回合" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.turnsLeft <= 1 ? 'danger' : row.turnsLeft <= 2 ? 'warning' : 'success'">
              {{ row.turnsLeft }} 回合
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="center">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button
                size="small"
                type="primary"
                :disabled="!canBuy(row)"
                @click="buyOrder(row)"
              >
                购买
              </el-button>
              <el-button
                size="small"
                type="warning"
                :disabled="!canNegotiate(row)"
                @click="openNegotiateDialog(row)"
              >
                议价
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="market-section">
      <h3>📦 我的挂单</h3>
      <div v-if="myOrders.length === 0" class="empty-state">
        你还没有发布过挂单
      </div>
      <el-table v-else :data="myOrders" size="small" stripe>
        <el-table-column label="物种" width="160">
          <template #default="{ row }">
            <div class="species-cell">
              <span class="species-icon">{{ getSpecies(row.speciesId)?.icon }}</span>
              <span class="species-name">{{ getSpecies(row.speciesId)?.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="quantity" label="数量" width="70" align="center" />
        <el-table-column label="单价" width="90" align="center">
          <template #default="{ row }">
            <span class="price-text">💰 {{ row.unitPrice }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="getStatusType(row.status)">
              {{ getStatusName(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="剩余回合" width="90" align="center">
          <template #default="{ row }">
            {{ row.status === 'active' || row.status === 'negotiating' ? row.turnsLeft + ' 回合' : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="议价中" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.currentNegotiation" size="small" type="warning">
              有
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" align="center">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'active'"
              size="small"
              type="danger"
              plain
              @click="cancelOrder(row)"
            >
              撤销
            </el-button>
            <el-button
              v-if="row.currentNegotiation"
              size="small"
              type="success"
              @click="showNegotiationDetail(row)"
            >
              查看议价
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showCreateDialog" title="发布挂单" width="420px">
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="选择物种">
          <el-select v-model="createForm.speciesId" placeholder="选择要出售的种子" style="width: 100%;">
            <el-option
              v-for="seed in ownedSeedList"
              :key="seed.speciesId"
              :label="`${seed.icon} ${seed.name} (拥有: ${seed.quantity})`"
              :value="seed.speciesId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="出售数量">
          <el-input-number
            v-model="createForm.quantity"
            :min="1"
            :max="maxQuantity"
            style="width: 100%;"
          />
        </el-form-item>
        <el-form-item label="单价">
          <el-input-number
            v-model="createForm.unitPrice"
            :min="minPrice"
            :max="maxPrice"
            style="width: 100%;"
          />
          <div v-if="createForm.speciesId" class="price-hint">
            价格范围: {{ minPrice }} ~ {{ maxPrice }} 金币（原价{{ basePrice }}的30%-300%）
          </div>
        </el-form-item>
        <el-form-item label="总价">
          <span class="total-price-preview">💰 {{ createForm.quantity * createForm.unitPrice }} 金币</span>
        </el-form-item>
        <el-form-item label="预计实收">
          <span class="seller-receive">💰 {{ Math.floor(createForm.quantity * createForm.unitPrice * (1 - tradeTaxRate)) }} 金币</span>
          <span class="tax-deduct">（扣税 {{ Math.floor(createForm.quantity * createForm.unitPrice * tradeTaxRate) }}）</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!canCreateOrder" @click="submitCreateOrder">
          确认发布
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showNegotiateDialog" title="发起议价" width="400px">
      <div v-if="negotiateOrder" class="negotiate-info">
        <div class="negotiate-species">
          <span class="species-icon">{{ getSpecies(negotiateOrder.speciesId)?.icon }}</span>
          <span class="species-name">{{ getSpecies(negotiateOrder.speciesId)?.name }}</span>
          <span class="quantity">x{{ negotiateOrder.quantity }}</span>
        </div>
        <div class="negotiate-prices">
          <div class="price-row">
            <span>挂单价：</span>
            <span class="original-price">💰 {{ negotiateOrder.unitPrice }} / 颗</span>
          </div>
          <div class="price-row">
            <span>挂单总价：</span>
            <span class="original-total">💰 {{ negotiateOrder.unitPrice * negotiateOrder.quantity }}</span>
          </div>
        </div>
      </div>
      <el-form label-width="80px" style="margin-top: 16px;">
        <el-form-item label="我的出价">
          <el-input-number
            v-model="negotiateForm.offerPrice"
            :min="negotiateMinPrice"
            :max="negotiateMaxPrice"
            style="width: 100%;"
          />
          <div class="price-hint">
            出价范围: {{ negotiateMinPrice }} ~ {{ negotiateMaxPrice }} 金币（不低于原价30%）
          </div>
        </el-form-item>
        <el-form-item label="出价总价">
          <span class="offer-total">💰 {{ negotiateForm.offerPrice * (negotiateOrder?.quantity || 0) }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showNegotiateDialog = false">取消</el-button>
        <el-button type="warning" @click="submitNegotiation">
          发送议价
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showNegotiationDetailDialog" title="议价详情" width="400px">
      <div v-if="currentNegotiationOrder?.currentNegotiation" class="negotiation-detail">
        <div class="negotiation-header">
          <div class="buyer-info">
            <span class="buyer-label">买家：</span>
            <span class="buyer-name">{{ currentNegotiationOrder.currentNegotiation.buyerName }}</span>
          </div>
          <el-tag size="small" :type="getNegotiationStatusType(currentNegotiationOrder.currentNegotiation.status)">
            {{ getNegotiationStatusName(currentNegotiationOrder.currentNegotiation.status) }}
          </el-tag>
        </div>
        <div class="negotiation-prices">
          <div class="price-row">
            <span>挂单价：</span>
            <span>💰 {{ currentNegotiationOrder.unitPrice }}</span>
          </div>
          <div class="price-row highlight">
            <span>买家出价：</span>
            <span class="offer-price">💰 {{ currentNegotiationOrder.currentNegotiation.offerPrice }}</span>
          </div>
          <div class="price-row">
            <span>出价总价：</span>
            <span>💰 {{ currentNegotiationOrder.currentNegotiation.offerPrice * currentNegotiationOrder.quantity }}</span>
          </div>
          <div class="price-row">
            <span>预计实收：</span>
            <span class="seller-receive">
              💰 {{ Math.floor(currentNegotiationOrder.currentNegotiation.offerPrice * currentNegotiationOrder.quantity * (1 - tradeTaxRate)) }}
            </span>
          </div>
        </div>
        <div class="negotiation-countdown" v-if="currentNegotiationOrder.currentNegotiation.status === 'pending'">
          剩余时间：{{ negotiationCountdown }}秒
        </div>
      </div>
      <template #footer v-if="currentNegotiationOrder?.currentNegotiation?.status === 'pending'">
        <el-button type="danger" @click="respondNegotiation(false)">拒绝</el-button>
        <el-button type="success" @click="respondNegotiation(true)">接受</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="showNegotiationDrawer" title="📬 议价通知" direction="right" size="360px">
      <div v-if="pendingNegotiations.length === 0" class="empty-state">
        暂无待处理的议价
      </div>
      <div v-else class="negotiation-list">
        <div
          v-for="neg in pendingNegotiations"
          :key="neg.id"
          class="negotiation-card"
        >
          <div class="card-header">
            <span class="buyer-name">{{ neg.buyerName }}</span>
            <el-tag size="small" type="warning">议价中</el-tag>
          </div>
          <div class="card-content">
            <div class="species-info">
              {{ getSpecies(findOrderById(neg.orderId)?.speciesId || '')?.icon }}
              {{ getSpecies(findOrderById(neg.orderId)?.speciesId || '')?.name }}
              x{{ findOrderById(neg.orderId)?.quantity }}
            </div>
            <div class="price-info">
              <span>出价: 💰 {{ neg.offerPrice }}</span>
            </div>
          </div>
          <div class="card-actions">
            <el-button size="small" type="danger" plain @click="quickRespondNegotiation(neg, false)">拒绝</el-button>
            <el-button size="small" type="success" @click="quickRespondNegotiation(neg, true)">接受</el-button>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useGameStore } from '../stores/game';
import { socket } from '../services/socket';
import type { MarketOrder, MarketOrderStatus, PlantCategory, Negotiation, NegotiationStatus, MarketSpeciesStats } from '../types/game';

const gameStore = useGameStore();

const filterCategory = ref('');
const sortBy = ref('price_asc');
const showCreateDialog = ref(false);
const showNegotiateDialog = ref(false);
const showNegotiationDetailDialog = ref(false);
const showNegotiationDrawer = ref(false);
const selectedStatsSpecies = ref('');
const selectedOrderIds = ref<string[]>([]);
const hoverIndex = ref(-1);
const negotiationCountdown = ref(10);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

const createForm = ref({
  speciesId: '',
  quantity: 1,
  unitPrice: 0
});

const negotiateOrder = ref<MarketOrder | null>(null);
const negotiateForm = ref({
  offerPrice: 0
});

const currentNegotiationOrder = ref<MarketOrder | null>(null);

const orderTable = ref();

const chartWidth = 500;
const chartHeight = 200;
const paddingTop = 20;
const paddingRight = 20;
const paddingBottom = 40;
const paddingLeft = 50;
const chartInnerWidth = chartWidth - paddingLeft - paddingRight;
const chartInnerHeight = chartHeight - paddingTop - paddingBottom;

const categoryList = [
  { value: 'tree', label: '🌳 乔木' },
  { value: 'shrub', label: '🌺 灌木' },
  { value: 'herb', label: '🌻 草本' },
  { value: 'vine', label: '🌿 藤本' },
  { value: 'aquatic', label: '🪷 水生' },
  { value: 'succulent', label: '🌵 多肉' }
];

const canTrade = computed(() => {
  return gameStore.gameState?.phase === 'playing' &&
    gameStore.currentPlayer &&
    !gameStore.currentPlayer.isBankrupt;
});

const marketStats = computed(() => gameStore.marketStats);
const publicFunds = computed(() => gameStore.publicFunds);
const tradeTaxRate = computed(() => gameStore.tradeTaxRate);
const pendingNegotiations = computed(() => {
  return gameStore.myOrders
    .filter(o => o.currentNegotiation && o.currentNegotiation.status === 'pending')
    .map(o => o.currentNegotiation!);
});

const currentStat = computed<MarketSpeciesStats | undefined>(() => {
  return marketStats.value.find(s => s.speciesId === selectedStatsSpecies.value);
});

const yAxisLabels = computed(() => {
  if (!currentStat.value) return ['0', '0', '0', '0', '0'];
  const prices = currentStat.value.priceHistory.map(p => p.avgPrice);
  const max = Math.max(...prices, 1);
  const labels = [];
  for (let i = 0; i <= 4; i++) {
    labels.push(Math.round(max - (max / 4) * i).toString());
  }
  return labels;
});

const linePoints = computed(() => {
  if (!currentStat.value) return '';
  return currentStat.value.priceHistory.map((point, i) => {
    return `${getX(i)},${getY(point.avgPrice)}`;
  }).join(' ');
});

const areaPoints = computed(() => {
  if (!currentStat.value) return '';
  const points = currentStat.value.priceHistory.map((point, i) => {
    return `${getX(i)},${getY(point.avgPrice)}`;
  });
  const firstX = getX(0);
  const lastX = getX(currentStat.value.priceHistory.length - 1);
  const bottomY = paddingTop + chartInnerHeight;
  return `${firstX},${bottomY} ${points.join(' ')} ${lastX},${bottomY}`;
});

function getX(index: number): number {
  if (!currentStat.value || currentStat.value.priceHistory.length <= 1) return paddingLeft;
  return paddingLeft + (chartInnerWidth / (currentStat.value.priceHistory.length - 1)) * index;
}

function getY(price: number): number {
  if (!currentStat.value) return paddingTop;
  const prices = currentStat.value.priceHistory.map(p => p.avgPrice);
  const max = Math.max(...prices, 1);
  if (max === 0) return paddingTop + chartInnerHeight;
  return paddingTop + chartInnerHeight - (price / max) * chartInnerHeight;
}

const ownedSeedList = computed(() => {
  const seeds = [];
  const owned = gameStore.currentPlayer?.ownedSeeds || {};
  for (const [speciesId, quantity] of Object.entries(owned)) {
    if (quantity > 0) {
      const species = gameStore.allSpecies[speciesId];
      if (species) {
        seeds.push({
          speciesId,
          name: species.name,
          icon: species.icon,
          quantity
        });
      }
    }
  }
  return seeds.sort((a, b) => a.name.localeCompare(b.name));
});

const basePrice = computed(() => {
  if (!createForm.value.speciesId) return 0;
  return gameStore.allSpecies[createForm.value.speciesId]?.price || 50;
});

const minPrice = computed(() => Math.floor(basePrice.value * 0.3));
const maxPrice = computed(() => Math.floor(basePrice.value * 3.0));

const maxQuantity = computed(() => {
  if (!createForm.value.speciesId) return 1;
  return gameStore.currentPlayer?.ownedSeeds[createForm.value.speciesId] || 0;
});

const canCreateOrder = computed(() => {
  return createForm.value.speciesId &&
    createForm.value.quantity > 0 &&
    createForm.value.quantity <= maxQuantity.value &&
    createForm.value.unitPrice >= minPrice.value &&
    createForm.value.unitPrice <= maxPrice.value;
});

const negotiateMinPrice = computed(() => {
  if (!negotiateOrder.value) return 0;
  const species = gameStore.allSpecies[negotiateOrder.value.speciesId];
  return Math.floor((species?.price || 50) * 0.3);
});

const negotiateMaxPrice = computed(() => {
  if (!negotiateOrder.value) return 0;
  return negotiateOrder.value.unitPrice - 1;
});

const myOrders = computed(() => gameStore.myOrders);

const filteredOrders = computed(() => {
  let orders = gameStore.marketOrders.filter(o => o.status === 'active' || o.status === 'negotiating');

  if (filterCategory.value) {
    orders = orders.filter(o => {
      const species = gameStore.allSpecies[o.speciesId];
      return species?.category === filterCategory.value;
    });
  }

  orders.sort((a, b) => {
    switch (sortBy.value) {
      case 'price_asc':
        return a.unitPrice - b.unitPrice;
      case 'price_desc':
        return b.unitPrice - a.unitPrice;
      case 'turns_desc':
        return b.turnsLeft - a.turnsLeft;
      case 'quantity_desc':
        return b.quantity - a.quantity;
      default:
        return 0;
    }
  });

  return orders;
});

const batchTotalCost = computed(() => {
  let total = 0;
  for (const id of selectedOrderIds.value) {
    const order = filteredOrders.value.find(o => o.id === id);
    if (order) {
      total += order.unitPrice * order.quantity;
    }
  }
  return total;
});

const canBatchBuy = computed(() => {
  if (!canTrade.value || selectedOrderIds.value.length === 0) return false;
  return (gameStore.currentPlayer?.money || 0) >= batchTotalCost.value;
});

function getSpecies(id: string) {
  return gameStore.allSpecies[id];
}

function getStatusName(status: string) {
  const map: Record<string, string> = {
    active: '在售',
    sold: '已成交',
    expired: '已过期',
    cancelled: '已撤销',
    negotiating: '议价中'
  };
  return map[status] || status;
}

function getOrderStatusName(status: string) {
  const map: Record<string, string> = {
    active: '在售',
    negotiating: '议价中'
  };
  return map[status] || status;
}

function getStatusType(status: string) {
  const map: Record<string, string> = {
    active: 'success',
    sold: 'primary',
    expired: 'info',
    cancelled: 'danger',
    negotiating: 'warning'
  };
  return map[status] || 'info';
}

function getNegotiationStatusName(status: string) {
  const map: Record<string, string> = {
    pending: '待响应',
    accepted: '已接受',
    rejected: '已拒绝',
    expired: '已超时'
  };
  return map[status] || status;
}

function getNegotiationStatusType(status: string) {
  const map: Record<string, string> = {
    pending: 'warning',
    accepted: 'success',
    rejected: 'danger',
    expired: 'info'
  };
  return map[status] || 'info';
}

function canBuy(order: MarketOrder) {
  if (!canTrade.value) return false;
  if (order.sellerId === gameStore.currentPlayerId) return false;
  if (order.status !== 'active') return false;
  const total = order.unitPrice * order.quantity;
  return (gameStore.currentPlayer?.money || 0) >= total;
}

function canNegotiate(order: MarketOrder) {
  if (!canTrade.value) return false;
  if (order.sellerId === gameStore.currentPlayerId) return false;
  if (order.status !== 'active') return false;
  const minPrice = Math.floor((gameStore.allSpecies[order.speciesId]?.price || 50) * 0.3);
  return order.unitPrice > minPrice;
}

function buyOrder(order: MarketOrder) {
  if (!canBuy(order)) return;

  const species = getSpecies(order.speciesId);
  const total = order.unitPrice * order.quantity;

  ElMessageBox.confirm(
    `确定以 ${total} 金币购买 ${order.quantity} 颗 ${species?.name || '种子'}吗？\n（卖家实收 ${Math.floor(total * (1 - tradeTaxRate.value))} 金币，扣税 ${Math.floor(total * tradeTaxRate.value)} 金币）`,
    '确认购买',
    { confirmButtonText: '确定', cancelButtonText: '取消', type: 'success' }
  ).then(() => {
    socket.value?.emit('buy_order', { orderId: order.id });
  }).catch(() => {});
}

function handleSelectionChange(selection: MarketOrder[]) {
  selectedOrderIds.value = selection.map(o => o.id);
}

function clearSelection() {
  if (orderTable.value) {
    orderTable.value.clearSelection();
  }
  selectedOrderIds.value = [];
}

function batchBuy() {
  if (!canBatchBuy.value) return;

  ElMessageBox.confirm(
    `确定批量购买 ${selectedOrderIds.value.length} 个挂单吗？\n总价：${batchTotalCost.value} 金币\n（原子性交易：如果任意挂单失效，整笔交易将回滚）`,
    '确认批量购买',
    { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
  ).then(() => {
    socket.value?.emit('buy_orders', { orderIds: selectedOrderIds.value });
  }).catch(() => {});
}

function cancelOrder(order: MarketOrder) {
  ElMessageBox.confirm(
    '确定要撤销这个挂单吗？种子将退回到你的背包。',
    '确认撤销',
    { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
  ).then(() => {
    socket.value?.emit('cancel_order', { orderId: order.id });
  }).catch(() => {});
}

function openNegotiateDialog(order: MarketOrder) {
  if (!canNegotiate(order)) return;
  negotiateOrder.value = order;
  negotiateForm.value.offerPrice = Math.floor(order.unitPrice * 0.85);
  showNegotiateDialog.value = true;
}

function submitNegotiation() {
  if (!negotiateOrder.value) return;

  socket.value?.emit('negotiate_price', {
    orderId: negotiateOrder.value.id,
    offerPrice: negotiateForm.value.offerPrice
  });

  showNegotiateDialog.value = false;
  ElMessage.info('议价已发送，等待卖家响应...');
}

function showNegotiationDetail(order: MarketOrder) {
  currentNegotiationOrder.value = order;
  startCountdown();
  showNegotiationDetailDialog.value = true;
}

function startCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }

  const updateCountdown = () => {
    if (!currentNegotiationOrder.value?.currentNegotiation) return;
    const remaining = Math.max(0, Math.ceil((currentNegotiationOrder.value.currentNegotiation.expiresAt - Date.now()) / 1000));
    negotiationCountdown.value = remaining;
    if (remaining <= 0) {
      if (countdownTimer) clearInterval(countdownTimer);
    }
  };

  updateCountdown();
  countdownTimer = setInterval(updateCountdown, 1000);
}

function respondNegotiation(accept: boolean) {
  if (!currentNegotiationOrder.value) return;

  const action = accept ? '接受' : '拒绝';
  ElMessageBox.confirm(
    `确定${action}这个议价吗？`,
    `确认${action}`,
    { confirmButtonText: '确定', cancelButtonText: '取消', type: accept ? 'success' : 'warning' }
  ).then(() => {
    socket.value?.emit('respond_negotiate', {
      orderId: currentNegotiationOrder.value!.id,
      accept
    });
    showNegotiationDetailDialog.value = false;
  }).catch(() => {});
}

function quickRespondNegotiation(negotiation: Negotiation, accept: boolean) {
  const order = findOrderById(negotiation.orderId);
  if (!order) return;

  const action = accept ? '接受' : '拒绝';
  ElMessageBox.confirm(
    `确定${action} ${negotiation.buyerName} 的议价吗？`,
    `确认${action}`,
    { confirmButtonText: '确定', cancelButtonText: '取消', type: accept ? 'success' : 'warning' }
  ).then(() => {
    socket.value?.emit('respond_negotiate', {
      orderId: negotiation.orderId,
      accept
    });
  }).catch(() => {});
}

function findOrderById(orderId: string): MarketOrder | undefined {
  return gameStore.marketOrders.find(o => o.id === orderId);
}

function submitCreateOrder() {
  if (!canCreateOrder.value) return;

  socket.value?.emit('create_order', {
    speciesId: createForm.value.speciesId,
    quantity: createForm.value.quantity,
    unitPrice: createForm.value.unitPrice
  });

  showCreateDialog.value = false;
  createForm.value = { speciesId: '', quantity: 1, unitPrice: 0 };
}

function handleMarketUpdate(data: { orders: MarketOrder[]; stats: any[]; publicFunds: number; taxRate: number }) {
  gameStore.setMarketOrders(data.orders);
  if (data.stats) {
    gameStore.setMarketStats(data.stats);
  }
  if (typeof data.publicFunds === 'number') {
    gameStore.setPublicFunds(data.publicFunds);
  }
  if (typeof data.taxRate === 'number') {
    gameStore.setTradeTaxRate(data.taxRate);
  }
}

function handleOrderCreated(data: { order: MarketOrder }) {
  const species = getSpecies(data.order.speciesId);
  ElMessage.success(`挂单发布成功！${species?.icon || '🌱'} ${species?.name || '种子'} x${data.order.quantity}`);
}

function handleOrderCancelled(data: { order: MarketOrder }) {
  const species = getSpecies(data.order.speciesId);
  ElMessage.info(`挂单已撤销，${species?.name || '种子'} 已退回`);
}

function handleOrderBought(data: { order: MarketOrder; taxAmount: number }) {
  const species = getSpecies(data.order.speciesId);
  const total = data.order.unitPrice * data.order.quantity;
  if (data.order.sellerId === gameStore.currentPlayerId) {
    const sellerReceive = total - data.taxAmount;
    ElMessage.success(`你的 ${species?.name} 挂单已售出！实收 ${sellerReceive} 金币（扣税 ${data.taxAmount}）`);
  } else {
    ElMessage.success(`购买成功！获得 ${data.order.quantity} 颗 ${species?.name}`);
  }
  clearSelection();
}

function handleOrderSold(data: { order: MarketOrder; taxAmount: number; sellerReceive: number }) {
  const species = getSpecies(data.order.speciesId);
  ElMessage.success(`你的 ${species?.name} 挂单已售出！实收 ${data.sellerReceive} 金币（扣税 ${data.taxAmount}）`);
}

function handleOrdersBought(data: { orders: MarketOrder[]; totalCost: number; totalTax: number }) {
  ElMessage.success(`批量购买成功！共 ${data.orders.length} 个挂单，花费 ${data.totalCost} 金币`);
  clearSelection();
}

function handleNegotiationReceived(data: { negotiation: Negotiation; order: MarketOrder }) {
  const species = getSpecies(data.order.speciesId);
  ElMessage({
    message: `${data.negotiation.buyerName} 对你的 ${species?.name} 挂单发起议价：${data.negotiation.offerPrice} 金币/颗`,
    type: 'warning',
    duration: 5000
  });
  showNegotiationDrawer.value = true;
}

function handleNegotiationAccepted(data: { order: MarketOrder; negotiation: Negotiation; taxAmount: number }) {
  const species = getSpecies(data.order.speciesId);
  ElMessage.success(`议价成功！以 ${data.negotiation.offerPrice} 金币/颗购买了 ${species?.name}`);
}

function handleNegotiationRejected(data: { negotiation: Negotiation; orderId: string }) {
  ElMessage.info('卖家拒绝了你的议价');
}

function handleNegotiationCreated(data: { negotiation: Negotiation; order: MarketOrder }) {
  ElMessage.success('议价已发送，等待卖家响应');
}

function handleNegotiationResponded(data: { accepted: boolean }) {
  if (data.accepted) {
    ElMessage.success('你接受了议价');
  } else {
    ElMessage.info('你拒绝了议价');
  }
}

watch(showNegotiationDetailDialog, (val) => {
  if (!val && countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
});

onMounted(() => {
  socket.value?.on('market_update', handleMarketUpdate);
  socket.value?.on('order_created', handleOrderCreated);
  socket.value?.on('order_cancelled', handleOrderCancelled);
  socket.value?.on('order_bought', handleOrderBought);
  socket.value?.on('order_sold', handleOrderSold);
  socket.value?.on('orders_bought', handleOrdersBought);
  socket.value?.on('negotiation_received', handleNegotiationReceived);
  socket.value?.on('negotiation_accepted', handleNegotiationAccepted);
  socket.value?.on('negotiation_rejected', handleNegotiationRejected);
  socket.value?.on('negotiation_created', handleNegotiationCreated);
  socket.value?.on('negotiation_responded', handleNegotiationResponded);

  socket.value?.emit('get_market');
});

onUnmounted(() => {
  socket.value?.off('market_update', handleMarketUpdate);
  socket.value?.off('order_created', handleOrderCreated);
  socket.value?.off('order_cancelled', handleOrderCancelled);
  socket.value?.off('order_bought', handleOrderBought);
  socket.value?.off('order_sold', handleOrderSold);
  socket.value?.off('orders_bought', handleOrdersBought);
  socket.value?.off('negotiation_received', handleNegotiationReceived);
  socket.value?.off('negotiation_accepted', handleNegotiationAccepted);
  socket.value?.off('negotiation_rejected', handleNegotiationRejected);
  socket.value?.off('negotiation_created', handleNegotiationCreated);
  socket.value?.off('negotiation_responded', handleNegotiationResponded);

  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
});
</script>

<style scoped>
.trade-market {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  position: relative;
  z-index: 1;
  overflow: hidden;
}

.market-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  position: relative;
  z-index: 2;
}

.market-header h2 {
  margin: 0;
  font-size: 18px;
  color: #2d5a27;
}

.market-tax-bar {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: linear-gradient(135deg, #f0f9eb 0%, #e1f3d8 100%);
  border-radius: 8px;
  border: 1px solid #c2e7b0;
}

.tax-info, .public-funds {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tax-label, .funds-label {
  font-size: 13px;
  color: #67c23a;
  font-weight: 500;
}

.tax-value, .funds-value {
  font-size: 15px;
  color: #67c23a;
  font-weight: bold;
}

.tax-hint, .funds-hint {
  font-size: 12px;
  color: #909399;
}

.market-stats-panel {
  flex-shrink: 0;
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  color: #333;
}

.stats-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stats-overview {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.stat-card {
  flex: 1;
  min-width: 120px;
  max-width: 160px;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.stat-card:hover {
  background: #f0f9eb;
  border-color: #c2e7b0;
}

.stat-card.active {
  background: #f0f9eb;
  border-color: #67c23a;
}

.stat-icon {
  font-size: 24px;
  text-align: center;
  margin-bottom: 4px;
}

.stat-name {
  font-size: 12px;
  color: #333;
  text-align: center;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-price {
  font-size: 14px;
  color: #ff9800;
  font-weight: bold;
  text-align: center;
}

.stat-volume {
  font-size: 11px;
  color: #909399;
  text-align: center;
  margin-top: 2px;
}

.chart-container {
  background: #fafafa;
  border-radius: 6px;
  padding: 12px;
}

.chart-title {
  font-size: 13px;
  color: #333;
  font-weight: 500;
  margin-bottom: 8px;
  text-align: center;
}

.chart-wrapper {
  display: flex;
  justify-content: center;
}

.price-chart {
  width: 100%;
  max-width: 500px;
  height: 200px;
}

.axis-label {
  font-size: 10px;
  fill: #909399;
}

.data-point {
  cursor: pointer;
  transition: r 0.2s;
}

.data-point:hover {
  r: 6;
}

.tooltip-text {
  font-size: 10px;
  fill: #fff;
}

.market-filters {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  width: 100%;
  box-sizing: border-box;
  position: relative;
  z-index: 2;
}

.market-section {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
  width: 100%;
  overflow: hidden;
}

.section-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.section-header h3 {
  margin: 0;
  font-size: 14px;
  color: #333;
}

.batch-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.selected-count {
  font-size: 13px;
  color: #67c23a;
  font-weight: 500;
}

.batch-total {
  font-size: 13px;
  color: #f56c6c;
  font-weight: bold;
}

.market-section h3 {
  flex-shrink: 0;
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #333;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 14px;
  min-height: 80px;
}

.species-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.species-icon {
  font-size: 20px;
}

.species-name {
  font-size: 13px;
  font-weight: 500;
}

.price-text {
  color: #ff9800;
  font-weight: 500;
}

.total-price {
  color: #f56c6c;
  font-weight: bold;
}

.total-price-preview {
  font-size: 16px;
  color: #f56c6c;
  font-weight: bold;
}

.seller-receive {
  color: #67c23a;
  font-weight: bold;
  font-size: 15px;
}

.tax-deduct {
  color: #909399;
  font-size: 12px;
  margin-left: 8px;
}

.price-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}

.action-buttons {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.negotiate-info {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 6px;
}

.negotiate-species {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e4e7ed;
}

.negotiate-species .species-icon {
  font-size: 28px;
}

.negotiate-species .species-name {
  font-size: 16px;
  font-weight: 500;
  flex: 1;
}

.negotiate-species .quantity {
  font-size: 14px;
  color: #909399;
}

.negotiate-prices .price-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}

.original-price {
  color: #909399;
  text-decoration: line-through;
}

.original-total {
  color: #909399;
  text-decoration: line-through;
}

.offer-total {
  color: #f56c6c;
  font-weight: bold;
  font-size: 16px;
}

.negotiation-detail {
  padding: 8px 0;
}

.negotiation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid #e4e7ed;
  margin-bottom: 12px;
}

.buyer-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.buyer-label {
  color: #606266;
  font-size: 13px;
}

.buyer-name {
  font-size: 15px;
  font-weight: 500;
  color: #303133;
}

.negotiation-prices .price-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 14px;
}

.negotiation-prices .price-row.highlight {
  padding: 10px;
  background: #fdf6ec;
  border-radius: 4px;
  margin: 6px 0;
}

.offer-price {
  color: #e6a23c;
  font-weight: bold;
  font-size: 16px;
}

.negotiation-countdown {
  margin-top: 12px;
  padding: 8px;
  background: #fef0f0;
  border-radius: 4px;
  text-align: center;
  color: #f56c6c;
  font-size: 13px;
}

.negotiation-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.negotiation-card {
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.card-header .buyer-name {
  font-size: 14px;
  font-weight: 500;
}

.card-content {
  padding: 8px 0;
  border-top: 1px solid #f2f6fc;
  border-bottom: 1px solid #f2f6fc;
  margin-bottom: 10px;
}

.species-info {
  font-size: 13px;
  color: #333;
  margin-bottom: 4px;
}

.price-info {
  font-size: 15px;
  color: #e6a23c;
  font-weight: bold;
}

.card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

:deep(.el-table) {
  flex: 1 1 0;
  min-height: 0;
  width: 100%;
}
</style>
