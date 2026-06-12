<template>
  <div class="leaderboard panel-card">
    <div class="panel-header">
      <h3>🏆 排行榜</h3>
    </div>
    <div class="panel-body">
      <div
        v-for="(entry, index) in leaderboardData"
        :key="entry.playerId"
        class="rank-item"
        :class="{
          'is-me': entry.playerId === gameStore.currentPlayerId,
          'rank-1': index === 0,
          'rank-2': index === 1,
          'rank-3': index === 2
        }"
      >
        <span class="rank-num">
          <template v-if="index === 0">🥇</template>
          <template v-else-if="index === 1">🥈</template>
          <template v-else-if="index === 2">🥉</template>
          <template v-else>{{ index + 1 }}</template>
        </span>
        <span class="rank-name">{{ entry.name }}</span>
        <span class="rank-score">{{ entry.score.toLocaleString() }}</span>
      </div>

      <el-divider />

      <el-collapse>
        <el-collapse-item title="📊 详细评分" name="detail">
          <div class="detail-table">
            <div class="detail-header">
              <span>玩家</span>
              <span>植物</span>
              <span>资金</span>
              <span>多样性</span>
              <span>科研</span>
              <span>满意度</span>
            </div>
            <div
              v-for="entry in leaderboardData"
              :key="entry.playerId"
              class="detail-row"
              :class="{ 'is-me': entry.playerId === gameStore.currentPlayerId }"
            >
              <span>{{ entry.name }}</span>
              <span>{{ entry.plantValue }}</span>
              <span>{{ entry.money }}</span>
              <span>{{ entry.diversity }}</span>
              <span>{{ entry.research }}</span>
              <span>{{ entry.satisfaction }}</span>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useGameStore } from '../stores/game';
import { socket } from '../services/socket';

const gameStore = useGameStore();

const leaderboardData = computed(() => {
  if (gameStore.leaderboard.length > 0) return gameStore.leaderboard;

  if (gameStore.gameState) {
    return Object.values(gameStore.gameState.players)
      .map(p => ({
        playerId: p.id,
        name: p.name,
        score: p.money,
        plantValue: 0,
        money: p.money,
        diversity: 0,
        research: p.researchProjects?.length || 0,
        satisfaction: 0
      }))
      .sort((a, b) => b.score - a.score);
  }
  return [];
});

onMounted(() => {
  socket.value?.emit('get_leaderboard');
});
</script>

<style scoped>
.rank-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  margin-bottom: 4px;
  font-size: 13px;
  transition: all 0.2s;
}

.rank-item.is-me {
  background: #e8f5e9;
  font-weight: bold;
}

.rank-item.rank-1 {
  background: linear-gradient(90deg, #fff9c4, #fff59d);
}

.rank-item.rank-2 {
  background: linear-gradient(90deg, #eceff1, #cfd8dc);
}

.rank-item.rank-3 {
  background: linear-gradient(90deg, #ffe0b2, #ffcc80);
}

.rank-num {
  width: 24px;
  text-align: center;
  font-weight: bold;
}

.rank-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-score {
  font-weight: bold;
  color: #2d5a27;
}

.detail-table {
  font-size: 11px;
}

.detail-header,
.detail-row {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr 1fr 1fr 1fr;
  gap: 4px;
  padding: 4px 0;
}

.detail-header {
  font-weight: bold;
  color: #666;
  border-bottom: 1px solid #eee;
}

.detail-row.is-me {
  background: #f1f8e9;
}
</style>
