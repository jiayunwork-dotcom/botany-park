<template>
  <div class="lobby">
    <div class="lobby-content">
      <div class="title-section">
        <h1 class="game-title">🌳 植物园经营 🌺</h1>
        <p class="game-subtitle">Botany Park - 多人回合制生态经营策略游戏</p>
      </div>

      <template v-if="!gameStore.gameState">
        <div class="lobby-form">
          <el-form :model="formData" label-width="100px">
            <el-form-item label="玩家名称">
              <el-input v-model="formData.playerName" placeholder="输入你的名字" maxlength="16" />
            </el-form-item>

            <div class="action-buttons">
              <el-button type="success" size="large" @click="createGame">
                🎮 创建游戏
              </el-button>
              <el-button type="primary" size="large" @click="showJoinDialog = true">
                🔗 加入游戏
              </el-button>
            </div>
          </el-form>
        </div>
      </template>

      <template v-else-if="gameStore.gameState.phase === 'waiting'">
        <div class="waiting-room">
          <div class="room-info">
            <el-tag type="success" size="large" effect="dark">
              等待玩家中... ({{ playerCount }}/{{ maxPlayers }})
            </el-tag>
            <div class="room-id-row">
              <span class="room-id-label">房间号:</span>
              <el-input v-model="gameStore.gameState.id" readonly size="small" class="room-id-input" />
              <el-button size="small" @click="copyGameId">📋 复制</el-button>
            </div>
          </div>

          <div class="player-list-section">
            <h4>👥 玩家列表</h4>
            <div class="player-list">
              <div
                v-for="pid in gameStore.gameState.playerOrder"
                :key="pid"
                class="player-item"
                :class="{
                  'is-host': pid === gameStore.gameState.hostId,
                  'is-me': pid === gameStore.currentPlayerId
                }"
              >
                <span class="player-avatar">👤</span>
                <span class="player-name">{{ gameStore.gameState.players[pid]?.name }}</span>
                <el-tag v-if="pid === gameStore.gameState.hostId" size="small" type="warning">
                  房主
                </el-tag>
                <el-tag v-if="pid === gameStore.currentPlayerId" size="small" type="success">
                  你
                </el-tag>
              </div>
            </div>
          </div>

          <div class="waiting-actions">
            <el-alert
              v-if="gameStore.isHost && playerCount < 4"
              title="至少需要4名玩家才能开始游戏"
              type="info"
              :closable="false"
              show-icon
            />
            <el-button
              v-if="gameStore.isHost"
              type="success"
              size="large"
              :disabled="playerCount < 4"
              @click="startGame"
            >
              🚀 开始游戏
            </el-button>
            <div v-else class="waiting-text">
              等待房主 {{ hostName }} 开始游戏...
            </div>
          </div>

          <el-button text type="danger" @click="leaveRoom" style="margin-top: 20px;">
            🚪 退出房间
          </el-button>
        </div>
      </template>

      <div class="game-rules">
        <el-collapse>
          <el-collapse-item title="📖 游戏规则" name="rules">
            <div class="rules-content">
              <h4>游戏目标</h4>
              <p>在20回合（5个游戏年）内，通过种植养护、科研育种、景观设计和访客运营，获取最高综合评分。</p>
              
              <h4>核心玩法</h4>
              <ul>
                <li>每位玩家拥有 12×12 网格地图的植物园</li>
                <li>种植不同类型植物，注意环境适宜度</li>
                <li>利用生态互作提升植物生长</li>
                <li>每4回合为一年（春夏秋冬）</li>
                <li>与其他4-6名玩家竞争客源</li>
              </ul>

              <h4>地块类型</h4>
              <ul>
                <li>🟫 普通土地 - 可种植</li>
                <li>🟩 温室 - 温度稳定，光照衰减</li>
                <li>🟦 池塘 - 水生植物专用</li>
                <li>⬜ 岩石区 - 多肉和高山植物</li>
                <li>🟧 步道 - 不可种植，提升体验</li>
                <li>🟪 科普展区 - 提升教育评分</li>
                <li>🟨 休息亭 - 增加游客停留</li>
              </ul>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </div>

    <el-dialog v-model="showJoinDialog" title="加入游戏" width="400px">
      <el-form :model="joinForm">
        <el-form-item label="玩家名称">
          <el-input v-model="formData.playerName" placeholder="输入你的名字" maxlength="16" />
        </el-form-item>
        <el-form-item label="房间号">
          <el-input v-model="joinForm.gameId" placeholder="输入房间号" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showJoinDialog = false">取消</el-button>
        <el-button type="primary" @click="joinGame">加入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { socket } from '../services/socket';
import { useGameStore } from '../stores/game';

const gameStore = useGameStore();

const formData = reactive({
  playerName: '',
  gameId: ''
});

const joinForm = reactive({
  gameId: ''
});

const showJoinDialog = ref(false);

const playerCount = computed(() => {
  if (!gameStore.gameState) return 0;
  return Object.keys(gameStore.gameState.players).length;
});

const maxPlayers = 6;

const hostName = computed(() => {
  if (!gameStore.gameState) return '';
  return gameStore.gameState.players[gameStore.gameState.hostId]?.name || '';
});

function createGame() {
  if (!formData.playerName.trim()) {
    ElMessage.warning('请输入玩家名称');
    return;
  }

  socket.value?.emit('create_game', {
    playerName: formData.playerName.trim()
  });

  socket.value?.once('game_created', (data) => {
    formData.gameId = data.gameId;
    gameStore.setCurrentPlayer(data.playerId);
    ElMessage.success('游戏创建成功！等待其他玩家加入...');
  });
}

function joinGame() {
  if (!formData.playerName.trim()) {
    ElMessage.warning('请先输入玩家名称');
    return;
  }
  if (!joinForm.gameId.trim()) {
    ElMessage.warning('请输入房间号');
    return;
  }

  socket.value?.emit('join_game', {
    gameId: joinForm.gameId.trim(),
    playerName: formData.playerName.trim()
  });

  socket.value?.once('game_joined', (data) => {
    formData.gameId = data.gameId;
    gameStore.setCurrentPlayer(data.playerId);
    showJoinDialog.value = false;
    ElMessage.success('加入成功！');
  });

  socket.value?.once('error', (data) => {
    ElMessage.error(data.message);
  });
}

function startGame() {
  socket.value?.emit('start_game');
}

function leaveRoom() {
  gameStore.reset();
  formData.gameId = '';
  ElMessage.info('已退出房间');
}

function copyGameId() {
  if (gameStore.gameState?.id) {
    navigator.clipboard.writeText(gameStore.gameState.id);
    ElMessage.success('房间号已复制');
  }
}
</script>

<style scoped>
.lobby {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.lobby-content {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  padding: 40px;
  max-width: 600px;
  width: 100%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.title-section {
  text-align: center;
  margin-bottom: 30px;
}

.game-title {
  font-size: 42px;
  color: #2d5a27;
  margin: 0 0 10px 0;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
}

.game-subtitle {
  font-size: 16px;
  color: #666;
  margin: 0;
}

.lobby-form {
  margin-bottom: 30px;
}

.action-buttons {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin: 20px 0;
}

.game-rules {
  border-top: 1px solid #eee;
  padding-top: 20px;
}

.rules-content h4 {
  color: #2d5a27;
  margin: 15px 0 8px 0;
}

.rules-content ul {
  padding-left: 20px;
  margin: 5px 0;
}

.rules-content li {
  margin: 4px 0;
  color: #555;
}

.waiting-room {
  margin-bottom: 20px;
}

.room-info {
  text-align: center;
  margin-bottom: 20px;
}

.room-id-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
}

.room-id-label {
  font-size: 14px;
  color: #666;
}

.room-id-input {
  width: 200px;
}

.player-list-section {
  background: #f5f5f5;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
}

.player-list-section h4 {
  margin: 0 0 12px 0;
  color: #2d5a27;
}

.player-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.player-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: white;
  border-radius: 8px;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.player-item.is-me {
  border-color: #4CAF50;
  background: #e8f5e9;
}

.player-item.is-host {
  border-color: #FF9800;
}

.player-avatar {
  font-size: 24px;
}

.player-name {
  flex: 1;
  font-weight: 500;
}

.waiting-actions {
  text-align: center;
}

.waiting-text {
  padding: 16px;
  color: #666;
  font-size: 14px;
}
</style>
