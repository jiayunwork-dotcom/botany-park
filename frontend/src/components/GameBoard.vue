<template>
  <div class="game-board">
    <TopBar />

    <div class="main-content">
      <div class="left-panel">
        <PlayerPanel />
        <SeedShop />
      </div>

      <div class="center-panel">
        <el-tabs v-model="activeTab" class="map-tabs">
          <el-tab-pane label="我的植物园" name="mine">
            <div v-if="!gameStore.currentPlayer" class="loading">
              <el-loading fullscreen-text="加载中..." />
            </div>
            <GameMap
              v-else
              :player="gameStore.currentPlayer"
              :isMine="true"
              @plot-click="handlePlotClick"
            />
          </el-tab-pane>
          <el-tab-pane label="其他玩家" name="others">
            <OtherPlayersView />
          </el-tab-pane>
          <el-tab-pane label="图鉴" name="codex">
            <PlantCodex />
          </el-tab-pane>
        </el-tabs>

        <ActionPanel @submit="submitActions" />
      </div>

      <div class="right-panel">
        <ResearchPanel />
        <LeaderboardView />
        <TurnEvents />
      </div>
    </div>

    <el-dialog v-model="showPlotDialog" title="地块操作" width="500px">
      <PlotActionDialog
        v-if="selectedPlot"
        :plot="selectedPlot"
        @close="showPlotDialog = false"
        @action="handlePlotAction"
      />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import TopBar from './TopBar.vue';
import PlayerPanel from './PlayerPanel.vue';
import SeedShop from './SeedShop.vue';
import GameMap from './GameMap.vue';
import OtherPlayersView from './OtherPlayersView.vue';
import PlantCodex from './PlantCodex.vue';
import ResearchPanel from './ResearchPanel.vue';
import LeaderboardView from './LeaderboardView.vue';
import TurnEvents from './TurnEvents.vue';
import ActionPanel from './ActionPanel.vue';
import PlotActionDialog from './PlotActionDialog.vue';
import { useGameStore } from '../stores/game';
import { socket } from '../services/socket';
import type { Plot, PlayerAction } from '../types/game';

const gameStore = useGameStore();

const activeTab = ref('mine');
const showPlotDialog = ref(false);
const selectedPlot = ref<Plot | null>(null);

const isPlaying = computed(() => gameStore.gameState?.phase === 'playing');

function handlePlotClick(plot: Plot) {
  if (!isPlaying.value) {
    ElMessage.warning('游戏尚未开始，请等待房主开始游戏');
    return;
  }
  if (gameStore.isMyTurnReady) {
    ElMessage.info('你已提交本回合操作，请等待其他玩家');
    return;
  }
  if (gameStore.currentPlayer?.isBankrupt) {
    ElMessage.warning('你已破产，无法操作');
    return;
  }
  if (plot.constructionTurnsLeft > 0) {
    ElMessage.info('该地块正在施工中，请等待完成');
    return;
  }
  selectedPlot.value = plot;
  showPlotDialog.value = true;
}

function handlePlotAction(action: PlayerAction) {
  gameStore.addPendingAction(action);
  showPlotDialog.value = false;
  ElMessage.success('已添加到待执行操作');
}

async function submitActions() {
  if (gameStore.pendingActions.length === 0) {
    try {
      await ElMessageBox.confirm(
        '没有待执行操作，确定要结束本回合吗？',
        '确认',
        { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
      );
    } catch {
      return;
    }
  }

  socket.value?.emit('submit_actions', {
    actions: gameStore.pendingActions
  });
  ElMessage.success('操作已提交，等待其他玩家...');
}
</script>

<style scoped>
.game-board {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #1a472a 0%, #2d5a27 50%, #1a472a 100%);
}

.main-content {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
  min-height: 0;
}

.left-panel,
.right-panel {
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  flex-shrink: 0;
}

.center-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  overflow: hidden;
}

.map-tabs {
  flex: 1;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.map-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: auto;
  padding: 12px;
}

.loading {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
