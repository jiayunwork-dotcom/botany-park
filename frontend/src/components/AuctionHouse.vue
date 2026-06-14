<template>
  <div class="auction-house">
    <div class="auction-header">
      <h2>🏛️ 种子拍卖行</h2>
      <el-button type="warning" @click="showCreateDialog = true" :disabled="!canAuction">
        🔨 发起拍卖
      </el-button>
    </div>

    <div class="auction-tax-bar">
      <div class="tax-info">
        <span class="tax-label">📊 交易税率：</span>
        <span class="tax-value">{{ (tradeTaxRate * 100).toFixed(0) }}%</span>
        <span class="tax-hint">（卖家支付，实收 = 成交价 × 95%）</span>
      </div>
      <div class="public-funds">
        <span class="funds-label">💰 公共资金池：</span>
        <span class="funds-value">{{ publicFunds }} 金币</span>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="auction-tabs">
      <el-tab-pane label="🔨 进行中的拍卖" name="active">
        <div v-if="activeAuctionsWithStats.length === 0" class="empty-state">
          暂无进行中的拍卖，快来发起第一场吧！
        </div>
        <el-table v-else :data="activeAuctionsWithStats" size="small" stripe>
          <el-table-column label="物种" width="160">
            <template #default="{ row }">
              <div class="species-cell">
                <span class="species-icon">{{ getSpecies(row.speciesId)?.icon }}</span>
                <span class="species-name">{{ getSpecies(row.speciesId)?.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="数量" width="80" align="center">
            <template #default="{ row }">{{ row.quantity }}</template>
          </el-table-column>
          <el-table-column label="当前最高价" width="130" align="center">
            <template #default="{ row }">
              <span class="price-high">💰 {{ row.currentHighBid }}</span>
            </template>
          </el-table-column>
          <el-table-column label="一口价" width="110" align="center">
            <template #default="{ row }">
              <el-tag v-if="row.buyNowPrice" type="warning" size="small" effect="dark">
                ⚡ {{ row.buyNowPrice }}
              </el-tag>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column label="剩余回合" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.turnsLeft <= 1 ? 'danger' : 'success'" size="small">
                {{ row.turnsLeft }} 回合
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="参与人数" width="100" align="center">
            <template #default="{ row }">
              👥 {{ row.participantCount }}
            </template>
          </el-table-column>
          <el-table-column label="卖家" width="120">
            <template #default="{ row }">{{ row.sellerName }}</template>
          </el-table-column>
          <el-table-column label="操作" width="220" align="center" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="openBidDialog(row)" :disabled="!canBid(row)">
                出价
              </el-button>
              <el-button v-if="row.buyNowPrice && canBid(row)" size="small" type="warning" @click="handleBuyNow(row)">
                一口价
              </el-button>
              <el-button size="small" @click="openDetailDialog(row)">
                详情
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="📜 历史记录" name="history">
        <div class="history-filter">
          <el-select v-model="historySpeciesFilter" placeholder="按物种筛选" clearable size="small" style="width: 200px;">
            <el-option
              v-for="species in allSpeciesList"
              :key="species.id"
              :label="`${species.icon} ${species.name}`"
              :value="species.id"
            />
          </el-select>
          <span class="history-hint">显示最近 20 场已结束拍卖</span>
        </div>
        <div v-if="filteredHistory.length === 0" class="empty-state">
          暂无历史拍卖记录
        </div>
        <el-table v-else :data="filteredHistory" size="small" stripe>
          <el-table-column label="物种" width="160">
            <template #default="{ row }">
              <div class="species-cell">
                <span class="species-icon">{{ getSpecies(row.speciesId)?.icon }}</span>
                <span class="species-name">{{ getSpecies(row.speciesId)?.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="数量" width="80" align="center">
            <template #default="{ row }">{{ row.quantity }}</template>
          </el-table-column>
          <el-table-column label="最终成交价" width="140" align="center">
            <template #default="{ row }">
              <span v-if="row.status === 'settled'" class="price-high">💰 {{ row.finalPrice }}</span>
              <span v-else class="failed-text">流拍</span>
            </template>
          </el-table-column>
          <el-table-column label="卖家" width="120">
            <template #default="{ row }">{{ row.sellerName }}</template>
          </el-table-column>
          <el-table-column label="买家/得主" width="120">
            <template #default="{ row }">
              {{ row.winnerName || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="结束回合" width="100" align="center">
            <template #default="{ row }">第 {{ row.settledAtTurn }} 回合</template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="getStatusType(row.status)" size="small">
                {{ getStatusText(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="📋 我发起的拍卖" name="created">
        <div v-if="myCreatedAuctions.length === 0" class="empty-state">
          你还没有发起过拍卖
        </div>
        <el-table v-else :data="myCreatedAuctions" size="small" stripe>
          <el-table-column label="物种" width="160">
            <template #default="{ row }">
              <div class="species-cell">
                <span class="species-icon">{{ getSpecies(row.speciesId)?.icon }}</span>
                <span class="species-name">{{ getSpecies(row.speciesId)?.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="数量" width="80" align="center">
            <template #default="{ row }">{{ row.quantity }}</template>
          </el-table-column>
          <el-table-column label="起拍价" width="110" align="center">
            <template #default="{ row }">💰 {{ row.startPrice }}</template>
          </el-table-column>
          <el-table-column label="当前价" width="110" align="center">
            <template #default="{ row }">
              <span class="price-high">💰 {{ row.currentHighBid }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="getStatusType(row.status)" size="small">
                {{ getStatusText(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="出价次数" width="100" align="center">
            <template #default="{ row }">{{ row.bids.length }}</template>
          </el-table-column>
          <el-table-column label="操作" width="180" align="center" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'active' && row.bids.length === 0"
                size="small"
                type="danger"
                @click="handleCancelAuction(row)"
              >
                取消
              </el-button>
              <el-button size="small" @click="openDetailDialog(row)">
                查看出价
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="🎯 我参与的拍卖" name="participated">
        <div v-if="myParticipatedAuctions.length === 0" class="empty-state">
          你还没有参与过任何拍卖
        </div>
        <el-table v-else :data="myParticipatedAuctions" size="small" stripe>
          <el-table-column label="物种" width="160">
            <template #default="{ row }">
              <div class="species-cell">
                <span class="species-icon">{{ getSpecies(row.speciesId)?.icon }}</span>
                <span class="species-name">{{ getSpecies(row.speciesId)?.name }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="数量" width="80" align="center">
            <template #default="{ row }">{{ row.quantity }}</template>
          </el-table-column>
          <el-table-column label="当前最高价" width="130" align="center">
            <template #default="{ row }">
              <span class="price-high">💰 {{ row.currentHighBid }}</span>
            </template>
          </el-table-column>
          <el-table-column label="我的出价" width="120" align="center">
            <template #default="{ row }">
              <span class="price-my">💰 {{ gameStore.getMyHighestBid(row.id) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <div v-if="row.status === 'active'">
                <el-tag v-if="gameStore.isLeadingBid(row.id)" type="success" size="small">
                  🥇 领先
                </el-tag>
                <el-tag v-else type="warning" size="small">
                  ⚠️ 落后
                </el-tag>
              </div>
              <div v-else>
                <el-tag :type="getStatusType(row.status)" size="small">
                  {{ getStatusText(row.status) }}
                </el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="结果" width="160" align="center">
            <template #default="{ row }">
              <template v-if="row.status === 'settled' && row.winnerId">
                <span v-if="row.winnerId === gameStore.currentPlayerId" class="winner-text">
                  🎉 你赢得了拍卖！
                </span>
                <span v-else class="loser-text">
                  未中标，得主：{{ row.winnerName }}
                </span>
              </template>
              <template v-else-if="row.status === 'failed'">
                <span class="failed-text">流拍</span>
              </template>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" align="center" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'active'"
                size="small"
                type="primary"
                @click="openBidDialog(row)"
                :disabled="!canBid(row)"
              >
                继续出价
              </el-button>
              <el-button size="small" @click="openDetailDialog(row)">
                详情
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showCreateDialog" title="发起拍卖" width="520px" @close="resetCreateForm">
      <el-form :model="createForm" label-width="120px">
        <el-form-item label="选择物种">
          <el-select v-model="createForm.speciesId" placeholder="选择要拍卖的种子" @change="onSpeciesChange">
            <el-option
              v-for="item in availableSeeds"
              :key="item.speciesId"
              :label="`${getSpecies(item.speciesId)?.icon} ${getSpecies(item.speciesId)?.name} (持有: ${item.count})`"
              :value="item.speciesId"
              :disabled="item.count <= 0"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="拍卖数量">
          <el-input-number
            v-model="createForm.quantity"
            :min="1"
            :max="maxQuantity"
            size="large"
            style="width: 100%"
          />
          <span class="form-hint">当前持有: {{ maxQuantity }} 颗</span>
        </el-form-item>
        <el-form-item label="起拍单价">
          <el-input-number
            v-model="createForm.startPrice"
            :min="minStartPrice"
            :step="10"
            size="large"
            style="width: 100%"
          />
          <span class="form-hint">
            最低 {{ minStartPrice }} 金币（原价 {{ originalPrice }} 的 50%）
          </span>
        </el-form-item>
        <el-form-item label="最低加价">
          <el-input-number
            v-model="createForm.minIncrement"
            :min="calculatedMinIncrement"
            :step="5"
            size="large"
            style="width: 100%"
          />
          <span class="form-hint">最低 {{ calculatedMinIncrement }} 金币（起拍价的 10%）</span>
        </el-form-item>
        <el-form-item label="持续回合">
          <el-radio-group v-model="createForm.totalTurns">
            <el-radio :label="1">1 回合</el-radio>
            <el-radio :label="2">2 回合</el-radio>
            <el-radio :label="3">3 回合</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="设置一口价">
          <el-switch v-model="createForm.enableBuyNow" />
          <span class="form-hint" v-if="createForm.enableBuyNow">
            买家出价达到一口价时立即成交
          </span>
        </el-form-item>
        <el-form-item v-if="createForm.enableBuyNow" label="一口价金额">
          <el-input-number
            v-model="createForm.buyNowPrice"
            :min="minBuyNowPrice"
            :step="10"
            size="large"
            style="width: 100%"
          />
          <span class="form-hint">
            一口价必须高于起拍价（最少 {{ minBuyNowPrice }} 金币）
          </span>
        </el-form-item>
        <el-form-item label="预估总价">
          <span class="estimate-price">💰 {{ createForm.startPrice * createForm.quantity }} 金币</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="warning" @click="handleCreateAuction" :disabled="!canSubmitCreate">
          确认发起拍卖
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showBidDialog" title="参与竞价" width="480px" @close="resetBidForm">
      <div v-if="bidTargetAuction" class="bid-info">
        <div class="bid-info-row">
          <span class="bid-info-label">拍卖物种：</span>
          <span class="bid-info-value">
            {{ getSpecies(bidTargetAuction.speciesId)?.icon }}
            {{ getSpecies(bidTargetAuction.speciesId)?.name }} × {{ bidTargetAuction.quantity }}
          </span>
        </div>
        <div class="bid-info-row">
          <span class="bid-info-label">卖家：</span>
          <span class="bid-info-value">{{ bidTargetAuction.sellerName }}</span>
        </div>
        <div class="bid-info-row highlight">
          <span class="bid-info-label">当前最高价：</span>
          <span class="bid-info-value price-high">💰 {{ bidTargetAuction.currentHighBid }}</span>
        </div>
        <div class="bid-info-row">
          <span class="bid-info-label">领先者：</span>
          <span class="bid-info-value">
            {{ bidTargetAuction.currentHighBidderName || '暂无出价' }}
          </span>
        </div>
        <div class="bid-info-row">
          <span class="bid-info-label">剩余回合：</span>
          <span class="bid-info-value">{{ bidTargetAuction.turnsLeft }} 回合</span>
        </div>
        <div class="bid-info-row">
          <span class="bid-info-label">我的余额：</span>
          <span class="bid-info-value">💰 {{ myMoney }} 金币</span>
        </div>
        <div v-if="myCommittedBids > 0" class="bid-info-row warn">
          <span class="bid-info-label">已承诺出价：</span>
          <span class="bid-info-value">💰 {{ myCommittedBids }} 金币</span>
        </div>
        <div class="bid-info-row info">
          <span class="bid-info-label">可用于本拍：</span>
          <span class="bid-info-value">💰 {{ availableForThisAuction }} 金币</span>
        </div>
      </div>
      <el-form :model="bidForm" label-width="120px" style="margin-top: 16px;">
        <el-form-item label="出价模式">
          <el-radio-group v-model="bidForm.mode">
            <el-radio label="manual">手动出价</el-radio>
            <el-radio label="proxy">代理出价</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="bidForm.mode === 'manual'" label="我的出价">
          <el-input-number
            v-model="bidForm.amount"
            :min="minBidAmount"
            :step="bidTargetAuction?.minIncrement || 10"
            size="large"
            style="width: 100%"
          />
          <span class="form-hint">至少出价 {{ minBidAmount }} 金币（{{ bidHint }}）</span>
        </el-form-item>
        <el-form-item v-if="bidForm.mode === 'proxy'" label="最高心理价">
          <el-input-number
            v-model="bidForm.proxyMaxPrice"
            :min="minProxyPrice"
            :step="bidTargetAuction?.minIncrement || 10"
            size="large"
            style="width: 100%"
          />
          <span class="form-hint">系统会自动加价直到达到此价格上限</span>
        </el-form-item>
        <div v-if="bidForm.mode === 'proxy'" class="proxy-bid-info">
          <el-alert
            title="代理出价说明"
            type="info"
            :closable="false"
            size="small"
            show-icon
          >
            <template #default>
              <p>• 设置一个您愿意支付的最高价格</p>
              <p>• 当有人超过当前最高价时，系统自动帮您加价</p>
              <p>• 每次加价幅度为最低加价金额</p>
              <p>• 余额校验按最高心理价位计算</p>
            </template>
          </el-alert>
        </div>
        <div v-if="myProxyBidInfo" class="current-proxy-info">
          <el-tag type="warning">当前代理出价上限：💰 {{ myProxyBidInfo.maxPrice }}</el-tag>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="showBidDialog = false">取消</el-button>
        <el-button type="primary" @click="handlePlaceBid" :disabled="!canSubmitBid">
          {{ bidForm.mode === 'proxy' ? '设置代理出价' : '确认出价' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDetailDialog" title="拍卖详情" width="600px">
      <div v-if="detailAuction" class="auction-detail">
        <div class="detail-header">
          <div class="detail-species">
            <span class="detail-icon">{{ getSpecies(detailAuction.speciesId)?.icon }}</span>
            <span class="detail-name">{{ getSpecies(detailAuction.speciesId)?.name }}</span>
            <span class="detail-quantity">× {{ detailAuction.quantity }}</span>
          </div>
          <el-tag :type="getStatusType(detailAuction.status)" size="large">
            {{ getStatusText(detailAuction.status) }}
          </el-tag>
        </div>

        <div class="detail-stats">
          <div class="stat-item">
            <span class="stat-label">卖家</span>
            <span class="stat-value">{{ detailAuction.sellerName }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">起拍价</span>
            <span class="stat-value">💰 {{ detailAuction.startPrice }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">加价幅度</span>
            <span class="stat-value">{{ detailAuction.minIncrement }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">当前最高价</span>
            <span class="stat-value price-high">💰 {{ detailAuction.currentHighBid }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">剩余/总回合</span>
            <span class="stat-value">{{ detailAuction.turnsLeft }} / {{ detailAuction.totalTurns }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">有效出价数</span>
            <span class="stat-value">{{ activeBidCount }}</span>
          </div>
          <div v-if="detailAuction.buyNowPrice" class="stat-item highlight">
            <span class="stat-label">⚡ 一口价</span>
            <span class="stat-value buy-now-price">💰 {{ detailAuction.buyNowPrice }}</span>
          </div>
          <div v-if="myProxyBidInDetail" class="stat-item">
            <span class="stat-label">我的代理价</span>
            <span class="stat-value proxy-price">💰 {{ myProxyBidInDetail.maxPrice }}</span>
          </div>
        </div>

        <div v-if="detailAuction.status === 'settled' && detailAuction.winnerId" class="detail-result success">
          🎉 得主：{{ detailAuction.winnerName }}，成交价：💰 {{ detailAuction.finalPrice }}
        </div>
        <div v-else-if="detailAuction.status === 'failed'" class="detail-result failed">
          ⚠️ 本场拍卖流拍，种子已退回卖家
        </div>

        <div v-if="detailAuction.status === 'active' && canWithdrawInDetail" class="detail-actions">
          <el-button type="danger" size="small" @click="handleWithdrawBid">
            ↩️ 撤回我的最近一次出价
          </el-button>
          <span class="withdraw-hint">（剩余撤回次数：{{ 1 - myWithdrawCountInDetail }} / 1）</span>
        </div>

        <div class="detail-bids-section">
          <h4>📜 出价历史（共 {{ detailAuction.bids.length }} 条记录）</h4>
          <div v-if="detailAuction.bids.length === 0" class="empty-state small">
            暂无人出价
          </div>
          <el-timeline v-else>
            <el-timeline-item
              v-for="(bid, index) in sortedBids"
              :key="bid.id"
              :timestamp="formatBidTime(bid.createdAt)"
              placement="top"
              :type="bid.status === 'withdrawn' ? 'info' : (index === 0 ? 'primary' : '')"
              :hollow="bid.status !== 'withdrawn' && index !== 0"
              :class="{ 'bid-withdrawn': bid.status === 'withdrawn' }"
            >
              <div class="bid-item" :class="{ 'bid-withdrawn': bid.status === 'withdrawn' }">
                <span class="bidder-name">{{ bid.bidderName }}</span>
                <span class="bid-amount">出价 💰 {{ bid.amount }}</span>
                <el-tag
                  v-if="bid.status === 'withdrawn'"
                  type="info"
                  size="small"
                >
                  已撤回
                </el-tag>
                <el-tag
                  v-else-if="isHighestActiveBid(bid) && detailAuction.status === 'active'"
                  type="success"
                  size="small"
                >
                  当前最高
                </el-tag>
                <el-tag
                  v-else-if="detailAuction.status === 'settled' && bid.bidderId === detailAuction.winnerId && isHighestActiveBid(bid)"
                  type="warning"
                  size="small"
                >
                  中标
                </el-tag>
                <el-tag v-if="bid.isAuto" type="primary" size="small" effect="plain">
                  自动加价
                </el-tag>
                <span v-if="bid.bidderId === gameStore.currentPlayerId" class="my-bid-tag">（我）</span>
              </div>
            </el-timeline-item>
          </el-timeline>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useGameStore } from '../stores/game';
import { socket } from '../services/socket';
import type { Auction, PlantSpecies } from '../types/game';

const gameStore = useGameStore();

const activeTab = ref('active');
const showCreateDialog = ref(false);
const showBidDialog = ref(false);
const showDetailDialog = ref(false);
const bidTargetAuction = ref<Auction | null>(null);
const detailAuction = ref<Auction | null>(null);

const createForm = reactive({
  speciesId: '',
  quantity: 1,
  startPrice: 0,
  minIncrement: 0,
  totalTurns: 2,
  enableBuyNow: false,
  buyNowPrice: 0
});

const bidForm = reactive({
  amount: 0,
  mode: 'manual' as 'manual' | 'proxy',
  proxyMaxPrice: 0
});

const historySpeciesFilter = ref('');

const tradeTaxRate = computed(() => gameStore.tradeTaxRate);
const publicFunds = computed(() => gameStore.publicFunds);

function getSpecies(id: string): PlantSpecies | undefined {
  return gameStore.allSpecies[id];
}

const canAuction = computed(() => {
  if (!gameStore.currentPlayer) return false;
  if (gameStore.currentPlayer.isBankrupt) return false;
  const totalSeeds = Object.values(gameStore.currentPlayer.ownedSeeds || {}).reduce((a, b) => a + b, 0);
  return totalSeeds > 0;
});

const availableSeeds = computed(() => {
  if (!gameStore.currentPlayer) return [];
  return Object.entries(gameStore.currentPlayer.ownedSeeds || {})
    .filter(([, count]) => count > 0)
    .map(([speciesId, count]) => ({ speciesId, count }));
});

const maxQuantity = computed(() => {
  if (!createForm.speciesId || !gameStore.currentPlayer) return 1;
  return gameStore.currentPlayer.ownedSeeds[createForm.speciesId] || 0;
});

const minStartPrice = computed(() => {
  const species = getSpecies(createForm.speciesId);
  if (!species) return 1;
  return Math.floor(species.price * 0.5);
});

const originalPrice = computed(() => {
  const species = getSpecies(createForm.speciesId);
  return species?.price || 0;
});

const calculatedMinIncrement = computed(() => {
  return Math.max(1, Math.floor(createForm.startPrice * 0.1));
});

const minBuyNowPrice = computed(() => {
  return createForm.startPrice + 1;
});

const allSpeciesList = computed(() => {
  return Object.values(gameStore.allSpecies);
});

const canSubmitCreate = computed(() => {
  let valid = (
    createForm.speciesId &&
    createForm.quantity >= 1 &&
    createForm.quantity <= maxQuantity.value &&
    createForm.startPrice >= minStartPrice.value &&
    createForm.minIncrement >= calculatedMinIncrement.value &&
    createForm.totalTurns >= 1 &&
    createForm.totalTurns <= 3
  );
  if (createForm.enableBuyNow) {
    valid = valid && createForm.buyNowPrice > createForm.startPrice;
  }
  return valid;
});

const activeAuctionsWithStats = computed(() => {
  return gameStore.activeAuctions.map(auction => ({
    ...auction,
    participantCount: new Set(auction.bids.map(b => b.bidderId)).size
  })).sort((a, b) => {
    if (a.turnsLeft !== b.turnsLeft) return a.turnsLeft - b.turnsLeft;
    return b.currentHighBid - a.currentHighBid;
  });
});

const myCreatedAuctions = computed(() => {
  return [...gameStore.myCreatedAuctions].sort((a, b) => b.createdAtTurn - a.createdAtTurn);
});

const myParticipatedAuctions = computed(() => {
  return [...gameStore.myParticipatedAuctions].sort((a, b) => b.createdAtTurn - a.createdAtTurn);
});

const myMoney = computed(() => gameStore.currentPlayer?.money || 0);

const myCommittedBids = computed(() => {
  let total = 0;
  for (const auction of gameStore.activeAuctions) {
    const proxyBid = auction.proxyBids?.find(p => p.bidderId === gameStore.currentPlayerId);
    if (proxyBid) {
      total += proxyBid.maxPrice;
      continue;
    }
    if (auction.currentHighBidderId === gameStore.currentPlayerId) {
      total += auction.currentHighBid;
    }
  }
  if (bidTargetAuction.value && bidTargetAuction.value.status === 'active') {
    const targetProxyBid = bidTargetAuction.value.proxyBids?.find(p => p.bidderId === gameStore.currentPlayerId);
    if (targetProxyBid) {
      total -= targetProxyBid.maxPrice;
    } else if (bidTargetAuction.value.currentHighBidderId === gameStore.currentPlayerId) {
      total -= bidTargetAuction.value.currentHighBid;
    }
  }
  return total;
});

const availableForThisAuction = computed(() => {
  return Math.max(0, myMoney.value - myCommittedBids.value);
});

const minBidAmount = computed(() => {
  if (!bidTargetAuction.value) return 0;
  const activeBids = gameStore.getActiveBids(bidTargetAuction.value);
  if (activeBids.length === 0) {
    return bidTargetAuction.value.startPrice;
  }
  return bidTargetAuction.value.currentHighBid + bidTargetAuction.value.minIncrement;
});

const bidHint = computed(() => {
  if (!bidTargetAuction.value) return '';
  const activeBids = gameStore.getActiveBids(bidTargetAuction.value);
  if (activeBids.length === 0) return '起拍价';
  return '当前最高价 + 最低加价';
});

const minProxyPrice = computed(() => {
  if (!bidTargetAuction.value) return 0;
  return minBidAmount.value;
});

const myProxyBidInfo = computed(() => {
  if (!bidTargetAuction.value) return null;
  return gameStore.getMyProxyBid(bidTargetAuction.value.id);
});

const canSubmitBid = computed(() => {
  if (!bidTargetAuction.value) return false;
  if (bidForm.mode === 'proxy') {
    return bidForm.proxyMaxPrice >= minProxyPrice.value && bidForm.proxyMaxPrice <= availableForThisAuction.value;
  }
  return (
    bidForm.amount >= minBidAmount.value &&
    bidForm.amount <= availableForThisAuction.value
  );
});

const sortedBids = computed(() => {
  if (!detailAuction.value) return [];
  return [...detailAuction.value.bids].sort((a, b) => b.createdAt - a.createdAt);
});

const filteredHistory = computed(() => {
  let history = gameStore.auctionHistory || [];
  if (historySpeciesFilter.value) {
    history = history.filter(h => h.speciesId === historySpeciesFilter.value);
  }
  return history;
});

const activeBidCount = computed(() => {
  if (!detailAuction.value) return 0;
  return gameStore.getActiveBids(detailAuction.value).length;
});

const canWithdrawInDetail = computed(() => {
  if (!detailAuction.value) return false;
  return gameStore.canWithdrawBid(detailAuction.value.id);
});

const myWithdrawCountInDetail = computed(() => {
  if (!detailAuction.value) return 0;
  return gameStore.getMyWithdrawCount(detailAuction.value.id);
});

const myProxyBidInDetail = computed(() => {
  if (!detailAuction.value) return undefined;
  return gameStore.getMyProxyBid(detailAuction.value.id);
});

function onSpeciesChange() {
  createForm.quantity = 1;
  const species = getSpecies(createForm.speciesId);
  if (species) {
    createForm.startPrice = Math.floor(species.price * 0.5);
    createForm.minIncrement = Math.floor(createForm.startPrice * 0.1);
    createForm.buyNowPrice = createForm.startPrice * 2;
  }
}

function resetCreateForm() {
  createForm.speciesId = '';
  createForm.quantity = 1;
  createForm.startPrice = 0;
  createForm.minIncrement = 0;
  createForm.totalTurns = 2;
  createForm.enableBuyNow = false;
  createForm.buyNowPrice = 0;
}

function resetBidForm() {
  bidForm.amount = 0;
  bidForm.mode = 'manual';
  bidForm.proxyMaxPrice = 0;
  bidTargetAuction.value = null;
}

function isHighestActiveBid(bid: any): boolean {
  if (!detailAuction.value) return false;
  const activeBids = gameStore.getActiveBids(detailAuction.value);
  if (activeBids.length === 0) return false;
  if (bid.status !== 'active') return false;
  const highest = activeBids.reduce((max, b) => b.amount > max.amount ? b : max, activeBids[0]);
  return bid.id === highest.id;
}

function canBid(auction: Auction): boolean {
  if (!gameStore.currentPlayer) return false;
  if (gameStore.currentPlayer.isBankrupt) return false;
  if (auction.sellerId === gameStore.currentPlayerId) return false;
  if (auction.status !== 'active') return false;
  return true;
}

function getStatusType(status: string) {
  switch (status) {
    case 'active': return 'success';
    case 'settled': return 'primary';
    case 'cancelled': return 'info';
    case 'failed': return 'danger';
    default: return 'info';
  }
}

function getStatusText(status: string) {
  switch (status) {
    case 'active': return '进行中';
    case 'settled': return '已成交';
    case 'cancelled': return '已取消';
    case 'failed': return '已流拍';
    default: return '未知';
  }
}

function formatBidTime(timestamp: number) {
  const d = new Date(timestamp);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function handleCreateAuction() {
  socket.value?.emit('create_auction', {
    speciesId: createForm.speciesId,
    quantity: createForm.quantity,
    startPrice: createForm.startPrice,
    minIncrement: createForm.minIncrement,
    totalTurns: createForm.totalTurns,
    buyNowPrice: createForm.enableBuyNow ? createForm.buyNowPrice : null
  });
  showCreateDialog.value = false;
  resetCreateForm();
}

async function handleCancelAuction(auction: Auction) {
  try {
    await ElMessageBox.confirm('确定要取消这场拍卖吗？种子将退回到你的背包。', '确认取消', {
      confirmButtonText: '确定取消',
      cancelButtonText: '保留',
      type: 'warning'
    });
    socket.value?.emit('cancel_auction', { auctionId: auction.id });
  } catch {
    // 用户取消
  }
}

function openBidDialog(auction: Auction) {
  if (auction.sellerId === gameStore.currentPlayerId) {
    ElMessage.warning('不能对自己发起的拍卖出价');
    return;
  }
  if (gameStore.currentPlayer?.isBankrupt) {
    ElMessage.warning('你已破产，无法参与竞价');
    return;
  }
  bidTargetAuction.value = auction;
  bidForm.amount = auction.currentHighBid + auction.minIncrement;
  const proxyBid = gameStore.getMyProxyBid(auction.id);
  if (proxyBid) {
    bidForm.mode = 'proxy';
    bidForm.proxyMaxPrice = proxyBid.maxPrice;
  } else {
    bidForm.mode = 'manual';
    bidForm.proxyMaxPrice = auction.currentHighBid + auction.minIncrement * 5;
  }
  showBidDialog.value = true;
}

function handlePlaceBid() {
  if (!bidTargetAuction.value) return;

  if (bidForm.mode === 'proxy') {
    socket.value?.emit('set_proxy_bid', {
      auctionId: bidTargetAuction.value.id,
      maxPrice: bidForm.proxyMaxPrice
    });
  } else {
    socket.value?.emit('place_bid', {
      auctionId: bidTargetAuction.value.id,
      bidAmount: bidForm.amount
    });
  }

  showBidDialog.value = false;
  resetBidForm();
}

async function handleWithdrawBid() {
  if (!detailAuction.value) return;
  try {
    await ElMessageBox.confirm('确定要撤回你最近的一次出价吗？撤回后将回退到前一个有效出价。', '确认撤回', {
      confirmButtonText: '确定撤回',
      cancelButtonText: '保留出价',
      type: 'warning'
    });
    socket.value?.emit('withdraw_bid', {
      auctionId: detailAuction.value.id
    });
  } catch {
    // 用户取消
  }
}

async function handleBuyNow(auction: Auction) {
  try {
    await ElMessageBox.confirm(`确定以一口价 ${auction.buyNowPrice} 金币直接购买吗？`, '确认一口价购买', {
      confirmButtonText: '确认购买',
      cancelButtonText: '再想想',
      type: 'warning'
    });
    socket.value?.emit('place_bid', {
      auctionId: auction.id,
      bidAmount: auction.buyNowPrice!
    });
  } catch {
    // 用户取消
  }
}

function loadAuctionHistory(speciesId?: string) {
  if (speciesId) {
    socket.value?.emit('get_auction_history', { speciesId });
  } else {
    socket.value?.emit('get_auction_history', {});
  }
}

function openDetailDialog(auction: Auction) {
  detailAuction.value = auction;
  showDetailDialog.value = true;
}

watch(activeTab, (newTab) => {
  if (newTab === 'history') {
    loadAuctionHistory(historySpeciesFilter.value || undefined);
  }
});

watch(historySpeciesFilter, (speciesId) => {
  if (activeTab.value === 'history') {
    loadAuctionHistory(speciesId || undefined);
  }
});

onMounted(() => {
  if (activeTab.value === 'history') {
    loadAuctionHistory();
  }
});
</script>

<style scoped>
.auction-house {
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 16px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
}

.auction-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.auction-header h2 {
  margin: 0;
  color: #b8860b;
  font-size: 20px;
}

.auction-tax-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background: linear-gradient(135deg, #fef9e7 0%, #fdf6e3 100%);
  border-radius: 6px;
  margin-bottom: 16px;
  border: 1px solid #f5deb3;
}

.tax-info, .public-funds {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tax-label, .funds-label {
  color: #666;
  font-size: 13px;
}

.tax-value {
  color: #e6a23c;
  font-weight: bold;
  font-size: 14px;
}

.funds-value {
  color: #67c23a;
  font-weight: bold;
  font-size: 14px;
}

.tax-hint, .funds-hint {
  color: #999;
  font-size: 12px;
}

.auction-tabs {
  background: #fff;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #999;
  font-size: 14px;
}

.empty-state.small {
  padding: 20px;
}

.species-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.species-icon {
  font-size: 20px;
}

.species-name {
  font-size: 13px;
}

.price-high {
  color: #f56c6c;
  font-weight: bold;
}

.price-my {
  color: #409eff;
  font-weight: bold;
}

.winner-text {
  color: #67c23a;
  font-weight: bold;
}

.loser-text {
  color: #909399;
  font-size: 12px;
}

.failed-text {
  color: #f56c6c;
}

.form-hint {
  display: block;
  margin-top: 4px;
  color: #999;
  font-size: 12px;
}

.estimate-price {
  font-size: 16px;
  font-weight: bold;
  color: #e6a23c;
}

.bid-info {
  background: #f5f7fa;
  padding: 16px;
  border-radius: 6px;
}

.bid-info-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px dashed #e4e7ed;
}

.bid-info-row:last-child {
  border-bottom: none;
}

.bid-info-row.highlight {
  background: #fef0f0;
  margin: 4px -8px;
  padding: 8px;
  border-radius: 4px;
  border-bottom: none;
}

.bid-info-row.warn {
  background: #fdf6ec;
  margin: 4px -8px;
  padding: 8px;
  border-radius: 4px;
  border-bottom: none;
}

.bid-info-row.info {
  background: #ecf5ff;
  margin: 4px -8px;
  padding: 8px;
  border-radius: 4px;
  border-bottom: none;
}

.bid-info-label {
  color: #666;
}

.bid-info-value {
  font-weight: 500;
}

.auction-detail {
  padding: 8px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 2px solid #ebeef5;
  margin-bottom: 16px;
}

.detail-species {
  display: flex;
  align-items: center;
  gap: 10px;
}

.detail-icon {
  font-size: 32px;
}

.detail-name {
  font-size: 18px;
  font-weight: bold;
  color: #303133;
}

.detail-quantity {
  font-size: 14px;
  color: #909399;
}

.detail-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.stat-item {
  background: #f5f7fa;
  padding: 10px 12px;
  border-radius: 6px;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.detail-result {
  padding: 12px 16px;
  border-radius: 6px;
  margin-bottom: 16px;
  font-weight: 600;
  text-align: center;
}

.detail-result.success {
  background: #f0f9eb;
  color: #67c23a;
  border: 1px solid #e1f3d8;
}

.detail-result.failed {
  background: #fef0f0;
  color: #f56c6c;
  border: 1px solid #fde2e2;
}

.detail-bids-section h4 {
  margin: 0 0 12px 0;
  color: #303133;
  font-size: 15px;
}

.bid-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bidder-name {
  font-weight: 600;
  color: #303133;
}

.bid-amount {
  color: #f56c6c;
  font-weight: 600;
}

.my-bid-tag {
  color: #409eff;
  font-size: 12px;
  font-weight: 600;
}

.history-filter {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 6px;
}

.history-hint {
  color: #909399;
  font-size: 12px;
}

.text-muted {
  color: #c0c4cc;
}

.bid-withdrawn .bid-item {
  opacity: 0.5;
  text-decoration: line-through;
}

.bid-item.bid-withdrawn {
  opacity: 0.5;
  text-decoration: line-through;
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: #fef0f0;
  border-radius: 6px;
  margin-bottom: 16px;
}

.withdraw-hint {
  color: #909399;
  font-size: 12px;
}

.buy-now-price {
  color: #e6a23c;
  font-weight: bold;
}

.proxy-price {
  color: #909399;
  font-weight: 600;
}

.proxy-bid-info {
  margin-top: 12px;
}

.proxy-bid-info :deep(.el-alert__description) p {
  margin: 4px 0;
  font-size: 12px;
}

.current-proxy-info {
  margin-top: 12px;
  text-align: center;
}

.stat-item.highlight {
  background: #fdf6ec;
  border: 1px solid #f5dab1;
}
</style>
