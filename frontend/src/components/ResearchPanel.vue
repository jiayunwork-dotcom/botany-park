<template>
  <div class="research-panel panel-card">
    <div class="panel-header">
      <h3>🔬 科研育种</h3>
    </div>
    <div class="panel-body">
      <div v-if="ongoingProjects.length > 0" class="ongoing-section">
        <div class="section-title">进行中的项目</div>
        <div v-for="proj in ongoingProjects" :key="proj.id" class="project-item">
          <div class="project-type">
            {{ projectTypeNames[proj.type] }}
          </div>
          <el-progress
            :percentage="Math.round(((proj.totalTurns - proj.turnsLeft) / proj.totalTurns) * 100)"
            :stroke-width="6"
          />
          <div class="project-turns">
            剩余 {{ proj.turnsLeft }} 回合
          </div>
        </div>
      </div>

      <el-divider />

      <div class="section-title">启动新项目</div>

      <el-collapse>
        <el-collapse-item title="🧬 杂交育种 (500金币, 3回合)" name="hybrid">
          <div class="hybrid-form">
            <el-form :model="hybridForm" size="small">
              <el-form-item label="亲本1">
                <el-select v-model="hybridForm.parent1" placeholder="选择物种">
                  <el-option
                    v-for="sid in discoveredSpeciesList"
                    :key="sid"
                    :label="`${gameStore.allSpecies[sid]?.icon} ${gameStore.allSpecies[sid]?.name}`"
                    :value="sid"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="亲本2">
                <el-select v-model="hybridForm.parent2" placeholder="选择物种">
                  <el-option
                    v-for="sid in discoveredSpeciesList"
                    :key="sid"
                    :label="`${gameStore.allSpecies[sid]?.icon} ${gameStore.allSpecies[sid]?.name}`"
                    :value="sid"
                  />
                </el-select>
              </el-form-item>
            </el-form>
            <el-button
              type="primary"
              :disabled="!hybridForm.parent1 || !hybridForm.parent2 || (player?.money || 0) < 500"
              @click="startHybrid"
            >
              开始杂交
            </el-button>
          </div>
        </el-collapse-item>

        <el-collapse-item title="🌿 濒危物种保护 (300金币, 3回合)" name="endangered">
          <div class="endangered-form">
            <p style="font-size: 12px; color: #666; margin-bottom: 10px;">
              接受政府委托保护濒危植物，完成后获得 1500 金币奖励
            </p>
            <el-select v-model="endangeredSpecies" placeholder="选择濒危物种" size="small">
              <el-option
                v-for="sid in rareSpeciesList"
                :key="sid"
                :label="`${gameStore.allSpecies[sid]?.icon} ${gameStore.allSpecies[sid]?.name}`"
                :value="sid"
              />
            </el-select>
            <el-button
              type="primary"
              style="margin-top: 10px;"
              :disabled="!endangeredSpecies || (player?.money || 0) < 300"
              @click="startEndangered"
            >
              接受任务
            </el-button>
          </div>
        </el-collapse-item>
      </el-collapse>

      <el-divider />

      <div class="section-title">出售种子</div>
      <div class="sell-section">
        <div
          v-for="[speciesId, count] of sellableSeeds"
          :key="speciesId"
          class="sell-item"
        >
          <span>{{ gameStore.allSpecies[speciesId]?.icon }} {{ gameStore.allSpecies[speciesId]?.name }}</span>
          <span>x{{ count }}</span>
          <el-button size="small" @click="sellSeed(speciesId, 1)">
            卖 💰{{ Math.round((gameStore.allSpecies[speciesId]?.price || 50) * 0.5) }}
          </el-button>
        </div>
        <div v-if="sellableSeeds.length === 0" class="empty">
          无可出售种子
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { useGameStore } from '../stores/game';

const gameStore = useGameStore();

const player = computed(() => gameStore.currentPlayer);
const ongoingProjects = computed(() => player.value?.researchProjects || []);

const discoveredSpeciesList = computed(() => player.value?.discoveredSpecies || []);
const rareSpeciesList = computed(() => {
  return Object.keys(gameStore.allSpecies).filter(
    sid => ['rare', 'epic', 'legendary'].includes(gameStore.allSpecies[sid]?.rarity || '')
  );
});

const sellableSeeds = computed(() => {
  if (!player.value?.ownedSeeds) return [];
  return Object.entries(player.value.ownedSeeds).filter(([_, c]) => (c as number) > 1);
});

const projectTypeNames: any = {
  hybrid: '🧬 杂交育种',
  domestication: '🌱 引种驯化',
  endangered: '🌿 濒危物种保护'
};

const hybridForm = reactive({
  parent1: '',
  parent2: ''
});

const endangeredSpecies = ref('');

function startHybrid() {
  if (!hybridForm.parent1 || !hybridForm.parent2) {
    ElMessage.warning('请选择两个亲本');
    return;
  }
  gameStore.addPendingAction({
    type: 'research',
    data: {
      type: 'hybrid',
      parent1Id: hybridForm.parent1,
      parent2Id: hybridForm.parent2
    }
  });
  ElMessage.success('已加入待执行操作');
  hybridForm.parent1 = '';
  hybridForm.parent2 = '';
}

function startEndangered() {
  if (!endangeredSpecies.value) {
    ElMessage.warning('请选择物种');
    return;
  }
  gameStore.addPendingAction({
    type: 'research',
    data: {
      type: 'endangered',
      endangeredSpeciesId: endangeredSpecies.value
    }
  });
  ElMessage.success('已加入待执行操作');
  endangeredSpecies.value = '';
}

function sellSeed(speciesId: string, quantity: number) {
  gameStore.addPendingAction({
    type: 'sell_seed',
    data: { speciesId, quantity }
  });
  ElMessage.success('已加入待执行操作');
}
</script>

<style scoped>
.ongoing-section {
  margin-bottom: 8px;
}

.section-title {
  font-size: 13px;
  font-weight: bold;
  color: #2d5a27;
  margin-bottom: 8px;
}

.project-item {
  padding: 8px;
  background: #f5f5f5;
  border-radius: 6px;
  margin-bottom: 6px;
}

.project-type {
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 4px;
}

.project-turns {
  font-size: 11px;
  color: #666;
  margin-top: 4px;
}

.hybrid-form,
.endangered-form {
  padding: 4px;
}

.sell-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sell-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #fafafa;
  border-radius: 6px;
  font-size: 12px;
}

.sell-item span:nth-child(2) {
  color: #666;
  margin-left: auto;
  margin-right: 8px;
}
</style>
