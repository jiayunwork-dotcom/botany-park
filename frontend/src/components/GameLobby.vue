<template>
  <div class="lobby">
    <div class="lobby-content">
      <div class="title-section">
        <h1 class="game-title">🌳 植物园经营 🌺</h1>
        <p class="game-subtitle">Botany Park - 多人回合制生态经营策略游戏</p>
      </div>

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

          <el-form-item v-if="formData.gameId" label="房间号">
            <el-input v-model="formData.gameId" readonly />
            <el-button @click="copyGameId" style="margin-left: 8px;">复制</el-button>
          </el-form-item>
        </el-form>
      </div>

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
import { ref, reactive } from 'vue';
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
    showJoinDialog.value = false;
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

function copyGameId() {
  navigator.clipboard.writeText(formData.gameId);
  ElMessage.success('房间号已复制');
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
</style>
