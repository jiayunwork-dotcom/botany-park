<template>
  <div class="app-container">
    <GameLobby v-if="!gameStore.gameState || gameStore.gameState.phase === 'waiting'" />
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
import type { RandomEvent, WeatherForecast, Auction, AuctionBid, AuctionSettlementResult } from './types/game';

const gameStore = useGameStore();

onMounted(async () => {
  try {
    const { playerId } = await initSocket();
    gameStore.setCurrentPlayer(playerId);

    socket.value?.on('game_state', (state) => {
      gameStore.setGameState(state);
      if (state.phase === 'playing') {
        socket.value?.emit('get_auctions');
      }
    });

    socket.value?.on('plants_data', (data) => {
      gameStore.setPlantsData(data.species, data.interactions);
    });

    socket.value?.on('error', (data) => {
      ElMessage.error(data.message);
    });

    socket.value?.on('turn_processed', (data: {
      events: string[];
      randomEvents: RandomEvent[];
      weatherForecast: WeatherForecast;
      leaderboard: any[];
      auctionSettlementResults?: AuctionSettlementResult[];
    }) => {
      gameStore.addTurnEvents(data.events);
      gameStore.setLeaderboard(data.leaderboard);
      gameStore.clearPendingActions();

      if (data.weatherForecast) {
        gameStore.setWeatherForecast(data.weatherForecast);
      }

      if (data.randomEvents && data.randomEvents.length > 0) {
        data.randomEvents.forEach(event => {
          gameStore.addPendingRandomEvent(event);
        });
      }

      if (data.auctionSettlementResults && data.auctionSettlementResults.length > 0) {
        data.auctionSettlementResults.forEach(result => {
          gameStore.addAuctionSettlement(result);
        });
      }
    });

    socket.value?.on('game_started', () => {
      ElMessage.success('游戏开始！');
      socket.value?.emit('get_auctions');
    });

    socket.value?.on('game_finished', (data) => {
      gameStore.setLeaderboard(data.leaderboard);
      ElMessage.success('游戏结束！查看最终排名');
    });

    socket.value?.on('market_update', (data: {
      orders: any[];
      stats: any[];
      publicFunds: number;
      taxRate: number;
    }) => {
      gameStore.setMarketOrders(data.orders);
      gameStore.setMarketStats(data.stats);
      gameStore.setPublicFunds(data.publicFunds);
      gameStore.setTradeTaxRate(data.taxRate);
    });

    socket.value?.on('auctions_update', (data: { auctions: Auction[] }) => {
      gameStore.setAuctions(data.auctions);
    });

    socket.value?.on('auction_created', (data: { auction: Auction }) => {
      ElMessage.success(`拍卖已发起：${data.auction.quantity} 颗种子，起拍价 ${data.auction.startPrice}`);
    });

    socket.value?.on('auction_cancelled', (data: { auction: Auction }) => {
      ElMessage.info('拍卖已取消，种子已退回背包');
    });

    socket.value?.on('bid_placed', (data: { auction: Auction; bid: AuctionBid }) => {
      ElMessage.success(`出价成功！当前最高价：${data.bid.amount}`);
    });

    socket.value?.on('auction_bid_notification', (data: {
      auctionId: string;
      currentHighBid: number;
      bidderName: string;
      speciesId: string;
      quantity: number;
    }) => {
      const species = gameStore.allSpecies[data.speciesId];
      const speciesName = species ? `${species.icon} ${species.name}` : '种子';
      ElMessage.warning(
        `🔔 ${data.bidderName} 对你参与的 ${speciesName} × ${data.quantity} 拍卖加价了！当前最高价：💰 ${data.currentHighBid}`
      );
    });

    socket.value?.on('auction_settled', (result: AuctionSettlementResult) => {
      gameStore.addAuctionSettlement(result);
      if (result.success) {
        if (result.winnerId === gameStore.currentPlayerId) {
          ElMessage.success(`🎉 恭喜！你赢得了拍卖，成交价：💰 ${result.finalPrice}`);
        } else {
          ElMessage.info(
            `🏛️ 一场拍卖已结束，${result.winnerName} 以 💰 ${result.finalPrice} 竞得`
          );
        }
      } else {
        ElMessage.info(`🏛️ 一场拍卖流拍：${result.reason}`);
      }
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
