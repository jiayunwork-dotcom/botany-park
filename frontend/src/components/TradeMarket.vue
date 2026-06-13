<template>
  <div class="trade-market">
    <div class="market-header">
      <h2>🌿 植物交易市场</h2>
      <el-button type="success" @click="showCreateDialog = true" :disabled="!canTrade">
        ＋ 发布挂单
      </el-button>
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
      <h3>📋 在售挂单</h3>
      <div v-if="filteredOrders.length === 0" class="empty-state">
        暂无在售挂单
      </div>
      <el-table v-else :data="filteredOrders" size="small" stripe>
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
        <el-table-column label="剩余回合" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.turnsLeft <= 1 ? 'danger' : row.turnsLeft <= 2 ? 'warning' : 'success'">
              {{ row.turnsLeft }} 回合
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template #default="{ row }">
            <el-button
              size="small"
              type="primary"
              :disabled="!canBuy(row)"
              @click="buyOrder(row)"
            >
              购买
            </el-button>
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
            {{ row.status === 'active' ? row.turnsLeft + ' 回合' : '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" align="center">
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
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!canCreateOrder" @click="submitCreateOrder">
          确认发布
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useGameStore } from '../stores/game';
import { socket } from '../services/socket';
import type { MarketOrder, MarketOrderStatus, PlantCategory } from '../types/game';

const gameStore = useGameStore();

const filterCategory = ref('');
const sortBy = ref('price_asc');
const showCreateDialog = ref(false);

const createForm = ref({
  speciesId: '',
  quantity: 1,
  unitPrice: 0
});

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

const myOrders = computed(() => gameStore.myOrders);

const filteredOrders = computed(() => {
  let orders = gameStore.marketOrders.filter(o => o.status === 'active');

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

function getSpecies(id: string) {
  return gameStore.allSpecies[id];
}

function getStatusName(status: string) {
  const map: Record<string, string> = {
    active: '在售',
    sold: '已成交',
    expired: '已过期',
    cancelled: '已撤销'
  };
  return map[status] || status;
}

function getStatusType(status: string) {
  const map: Record<string, string> = {
    active: 'success',
    sold: 'primary',
    expired: 'info',
    cancelled: 'danger'
  };
  return map[status] || 'info';
}

function canBuy(order: MarketOrder) {
  if (!canTrade.value) return false;
  if (order.sellerId === gameStore.currentPlayerId) return false;
  const total = order.unitPrice * order.quantity;
  return (gameStore.currentPlayer?.money || 0) >= total;
}

function buyOrder(order: MarketOrder) {
  if (!canBuy(order)) return;

  const species = getSpecies(order.speciesId);
  const total = order.unitPrice * order.quantity;

  ElMessageBox.confirm(
    `确定以 ${total} 金币购买 ${order.quantity} 颗 ${species?.name || '种子'}吗？`,
    '确认购买',
    { confirmButtonText: '确定', cancelButtonText: '取消', type: 'success' }
  ).then(() => {
    socket.value?.emit('buy_order', { orderId: order.id });
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

function handleMarketUpdate(data: { orders: MarketOrder[] }) {
  gameStore.setMarketOrders(data.orders);
}

function handleOrderCreated(data: { order: MarketOrder }) {
  const species = getSpecies(data.order.speciesId);
  ElMessage.success(`挂单发布成功！${species?.icon || '🌱'} ${species?.name || '种子'} x${data.order.quantity}`);
}

function handleOrderCancelled(data: { order: MarketOrder }) {
  const species = getSpecies(data.order.speciesId);
  ElMessage.info(`挂单已撤销，${species?.name || '种子'} 已退回`);
}

function handleOrderBought(data: { order: MarketOrder }) {
  const species = getSpecies(data.order.speciesId);
  if (data.order.sellerId === gameStore.currentPlayerId) {
    const total = data.order.unitPrice * data.order.quantity;
    ElMessage.success(`你的 ${species?.name} 挂单已售出！获得 ${total} 金币`);
  } else {
    ElMessage.success(`购买成功！获得 ${data.order.quantity} 颗 ${species?.name}`);
  }
}

onMounted(() => {
  socket.value?.on('market_update', handleMarketUpdate);
  socket.value?.on('order_created', handleOrderCreated);
  socket.value?.on('order_cancelled', handleOrderCancelled);
  socket.value?.on('order_bought', handleOrderBought);

  socket.value?.emit('get_market');
});

onUnmounted(() => {
  socket.value?.off('market_update', handleMarketUpdate);
  socket.value?.off('order_created', handleOrderCreated);
  socket.value?.off('order_cancelled', handleOrderCancelled);
  socket.value?.off('order_bought', handleOrderBought);
});
</script>

<style scoped>
.trade-market {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.market-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.market-header h2 {
  margin: 0;
  font-size: 18px;
  color: #2d5a27;
}

.market-filters {
  display: flex;
  gap: 10px;
  align-items: center;
}

.market-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.market-section h3 {
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

.price-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}

:deep(.el-table) {
  flex: 1;
  overflow: auto;
}
</style>
