<template>
  <div class="plant-codex">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="🌱 植物图鉴" name="plants">
        <div class="codex-filters">
          <el-select v-model="filterCategory" placeholder="分类" size="small" clearable>
            <el-option label="乔木" value="tree" />
            <el-option label="灌木" value="shrub" />
            <el-option label="草本" value="herb" />
            <el-option label="藤本" value="vine" />
            <el-option label="水生" value="aquatic" />
            <el-option label="多肉" value="succulent" />
          </el-select>
          <el-select v-model="filterRarity" placeholder="稀有度" size="small" clearable>
            <el-option label="普通" value="common" />
            <el-option label="优秀" value="uncommon" />
            <el-option label="稀有" value="rare" />
            <el-option label="史诗" value="epic" />
            <el-option label="传说" value="legendary" />
          </el-select>
        </div>

        <div class="species-grid">
          <el-card
            v-for="species in filteredSpecies"
            :key="species.id"
            class="species-card"
            :body-style="{ padding: '12px' }"
          >
            <div class="species-header">
              <span class="species-icon">{{ species.icon }}</span>
              <div class="species-title">
                <div class="species-name">{{ species.name }}</div>
                <el-tag size="small" :type="getRarityType(species.rarity)">
                  {{ getRarityName(species.rarity) }}
                </el-tag>
              </div>
            </div>
            <p class="species-desc">{{ species.description }}</p>
            <div class="species-stats">
              <div class="stat">
                <span class="stat-label">☀️ 光照</span>
                <span>{{ species.lightRange[0] }}-{{ species.lightRange[1] }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">💧 水分</span>
                <span>{{ species.waterRange[0] }}-{{ species.waterRange[1] }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">🌡️ 温度</span>
                <span>{{ species.tempRange[0] }}-{{ species.tempRange[1] }}°</span>
              </div>
              <div class="stat">
                <span class="stat-label">⚗️ pH</span>
                <span>{{ species.phRange[0] }}-{{ species.phRange[1] }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">📈 生长</span>
                <span>{{ species.growthRate }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">⏱️ 寿命</span>
                <span>{{ species.lifespan }}回合</span>
              </div>
              <div class="stat">
                <span class="stat-label">💎 价值</span>
                <span>{{ species.baseValue }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">💰 价格</span>
                <span>{{ species.price }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">🛡️ 抗灾</span>
                <span>{{ getResistanceLabel(species.disasterResistance) }}</span>
              </div>
            </div>
          </el-card>
        </div>
      </el-tab-pane>

      <el-tab-pane label="🔗 生态互作" name="ecology">
        <div class="ecology-list">
          <el-card
            v-for="(info, idx) in gameStore.ecologyInteractions"
            :key="idx"
            class="ecology-card"
          >
            <template #header>
              <div class="ecology-header">
                <span class="ecology-type">{{ getEcologyIcon(info.type) }}</span>
                <span class="ecology-name">{{ info.name }}</span>
              </div>
            </template>
            <p>{{ info.description }}</p>
            <el-tag type="success" size="small">效果: {{ info.effect }}</el-tag>
          </el-card>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useGameStore } from '../stores/game';

const gameStore = useGameStore();

const activeTab = ref('plants');
const filterCategory = ref('');
const filterRarity = ref('');

const allSpecies = computed(() => Object.values(gameStore.allSpecies));

const filteredSpecies = computed(() => {
  return allSpecies.value.filter(s => {
    if (filterCategory.value && s.category !== filterCategory.value) return false;
    if (filterRarity.value && s.rarity !== filterRarity.value) return false;
    return true;
  });
});

function getRarityName(rarity: string) {
  const map: any = {
    common: '普通',
    uncommon: '优秀',
    rare: '稀有',
    epic: '史诗',
    legendary: '传说'
  };
  return map[rarity] || rarity;
}

function getRarityType(rarity: string) {
  const map: any = {
    common: 'info',
    uncommon: '',
    rare: 'success',
    epic: 'warning',
    legendary: 'danger'
  };
  return map[rarity] || 'info';
}

function getEcologyIcon(type: string) {
  const map: any = {
    pollination: '🐝 授粉互助',
    symbiosis: '🤝 共生关系',
    competition: '🌳 竞争关系',
    allelopathy: '⚠️ 化感作用'
  };
  return map[type] || type;
}

function getResistanceLabel(resistance?: number): string {
  if (resistance === undefined || resistance === null) return '无';
  const pct = Math.round(resistance * 100);
  if (pct >= 70) return `极强(${pct}%)`;
  if (pct >= 50) return `较强(${pct}%)`;
  if (pct >= 30) return `一般(${pct}%)`;
  return `较弱(${pct}%)`;
}
</script>

<style scoped>
.plant-codex {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.codex-filters {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.species-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
  overflow-y: auto;
  padding-bottom: 12px;
}

.species-card {
  transition: transform 0.2s;
}

.species-card:hover {
  transform: translateY(-2px);
}

.species-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.species-icon {
  font-size: 32px;
}

.species-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.species-name {
  font-size: 16px;
  font-weight: bold;
}

.species-desc {
  font-size: 12px;
  color: #666;
  margin: 8px 0;
  min-height: 32px;
}

.species-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  font-size: 11px;
}

.stat {
  display: flex;
  justify-content: space-between;
  padding: 2px 4px;
  background: #fafafa;
  border-radius: 4px;
}

.stat-label {
  color: #666;
}

.ecology-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  overflow-y: auto;
  padding-bottom: 12px;
}

.ecology-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ecology-type {
  font-weight: bold;
  color: #2d5a27;
}
</style>
