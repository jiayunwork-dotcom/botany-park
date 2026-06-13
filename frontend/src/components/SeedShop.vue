<template>
  <div class="seed-shop panel-card">
    <div class="panel-header">
      <h3>🏪 种子商店</h3>
      <el-button size="small" type="success" @click="refreshShop">🔄</el-button>
    </div>
    <div class="panel-body">
      <div v-if="!shopItems || shopItems.length === 0" class="empty">
        商店暂无商品
      </div>
      <div
        v-for="item in shopItems"
        :key="item.speciesId"
        class="shop-item"
        :class="{ disabled: (player?.money || 0) < item.price || item.stock <= 0 }"
      >
        <span class="item-icon">{{ getSpecies(item.speciesId)?.icon }}</span>
        <div class="item-info">
          <span class="item-name">{{ getSpecies(item.speciesId)?.name }}</span>
          <div class="item-meta">
            <el-tag size="small" :type="getRarityType(getSpecies(item.speciesId)?.rarity)">
              {{ getRarityName(getSpecies(item.speciesId)?.rarity) }}
            </el-tag>
            <span class="item-stock">库存: {{ item.stock }}</span>
          </div>
        </div>
        <div class="item-buy">
          <div class="item-price">💰 {{ item.price }}</div>
          <el-button
            size="small"
            type="primary"
            :disabled="(player?.money || 0) < item.price || item.stock <= 0"
            @click="buySeed(item.speciesId, 1)"
          >
            购买
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useGameStore } from '../stores/game';
import { socket } from '../services/socket';

const gameStore = useGameStore();

const player = computed(() => gameStore.currentPlayer);
const shopItems = computed(() => {
  if (!gameStore.gameState || !gameStore.currentPlayerId) return [];
  return gameStore.gameState.seedShop[gameStore.currentPlayerId] || [];
});

function handleSeedPurchased(data: { speciesId: string; quantity: number }) {
  const species = gameStore.allSpecies[data.speciesId];
  ElMessage.success(`成功购买 ${species?.icon || '🌱'} ${species?.name || '种子'} x${data.quantity}！`);
}

onMounted(() => {
  socket.value?.on('seed_purchased', handleSeedPurchased);
});

onUnmounted(() => {
  socket.value?.off('seed_purchased', handleSeedPurchased);
});

function getSpecies(id: string) {
  return gameStore.allSpecies[id];
}

function getRarityName(rarity?: string) {
  const map: any = {
    common: '普通',
    uncommon: '优秀',
    rare: '稀有',
    epic: '史诗',
    legendary: '传说'
  };
  return map[rarity || 'common'];
}

function getRarityType(rarity?: string) {
  const map: any = {
    common: 'info',
    uncommon: '',
    rare: 'success',
    epic: 'warning',
    legendary: 'danger'
  };
  return map[rarity || 'common'];
}

function buySeed(speciesId: string, quantity: number) {
  if (!player.value || player.value.money <= 0) {
    ElMessage.warning('资金不足');
    return;
  }
  socket.value?.emit('buy_seed', { speciesId, quantity });
}

function refreshShop() {
  ElMessage.info('商店将在下一回合刷新');
}
</script>

<style scoped>
.shop-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  margin-bottom: 6px;
  background: #fafafa;
  transition: all 0.2s;
}

.shop-item:hover:not(.disabled) {
  background: #f0f7f0;
}

.shop-item.disabled {
  opacity: 0.6;
}

.item-icon {
  font-size: 24px;
}

.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-name {
  font-size: 13px;
  font-weight: 500;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.item-stock {
  color: #666;
}

.item-buy {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.item-price {
  font-size: 12px;
  color: #ff9800;
  font-weight: bold;
}
</style>
