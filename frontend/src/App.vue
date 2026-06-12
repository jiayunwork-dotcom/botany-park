<template>
  <div class="app-container">
    <GameLobby v-if="!gameStore.gameState" />
    <GameBoard v-else />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import GameLobby from './components/GameLobby.vue';
import GameBoard from './components/GameBoard.vue';
import { useGameStore } from './stores/game';
import { initSocket, socket } from './services/socket';

const gameStore = useGameStore();

onMounted(async () => {
  try {
    const savedPlayerId = localStorage.getItem('botany_player_id') || undefined;
    const { playerId } = await initSocket(savedPlayerId);
    gameStore.setCurrentPlayer(playerId);

    socket.value?.on('game_state', (state) => {
      gameStore.setGameState(state);
      if (state.allSpecies) {
        gameStore.allSpecies = { ...gameStore.allSpecies, ...state.allSpecies };
      }
    });

    socket.value?.on('plants_data', (data) => {
      gameStore.setPlantsData(data.species, data.interactions);
    });

    socket.value?.on('error', (data) => {
      ElMessage.error(data.message);
    });

    socket.value?.on('turn_processed', (data) => {
      gameStore.addTurnEvents(data.events);
      gameStore.setLeaderboard(data.leaderboard);
      gameStore.clearPendingActions();
    });

    socket.value?.on('game_started', () => {
      ElMessage.success('游戏开始！');
    });

    socket.value?.on('game_finished', (data) => {
      gameStore.setLeaderboard(data.leaderboard);
      ElMessage.success('游戏结束！查看最终排名');
    });

    socket.value?.emit('get_plants_data');
  } catch (e) {
    ElMessage.error('连接服务器失败');
  }
});
</script>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #1a472a 0%, #2d5a27 50%, #1a472a 100%);
}
</style>
