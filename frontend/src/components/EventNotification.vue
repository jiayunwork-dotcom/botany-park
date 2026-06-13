<template>
  <Transition name="event-popup">
    <div v-if="visible" class="event-notification-overlay" @click.self="handleClose">
      <div class="event-notification" :class="`severity-${currentEvent?.severity}`">
        <div class="event-header">
          <span class="event-icon">{{ currentEvent?.icon }}</span>
          <span class="event-type">{{ eventTypeName }}</span>
          <div class="severity-badges">
            <span
              v-for="i in 3"
              :key="i"
              class="severity-dot"
              :class="{ active: i <= (currentEvent?.severity || 0) }"
            ></span>
          </div>
        </div>

        <div class="event-body">
          <p class="event-description">{{ currentEvent?.description }}</p>
        </div>

        <div class="event-footer">
          <div class="affected-players">
            <span class="label">影响玩家:</span>
            <span class="players">{{ affectedPlayersText }}</span>
          </div>
          <div class="countdown">
            {{ countdown }}s 后自动关闭
          </div>
        </div>

        <button class="close-btn" @click="handleClose">
          ✕
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useGameStore } from '../stores/game';
import type { RandomEvent } from '../types/game';

const gameStore = useGameStore();
const { pendingRandomEvents } = storeToRefs(gameStore);

const visible = ref(false);
const currentEventIndex = ref(0);
const countdown = ref(3);
let countdownTimer: number | null = null;

const currentEvent = computed<RandomEvent | null>(() => {
  if (pendingRandomEvents.value.length === 0) return null;
  return pendingRandomEvents.value[currentEventIndex.value] || null;
});

const eventTypeName = computed(() => {
  const typeMap: { [key: string]: string } = {
    pest: '虫害灾害',
    weather: '极端天气',
    media: '媒体报道',
    policy: '政策调整'
  };
  return typeMap[currentEvent.value?.type || ''] || '随机事件';
});

const affectedPlayersText = computed(() => {
  if (!currentEvent.value?.affectedPlayerNames) return '无';
  return currentEvent.value.affectedPlayerNames.join('、');
});

function showNextEvent() {
  if (currentEventIndex.value < pendingRandomEvents.value.length) {
    visible.value = true;
    startCountdown();
  } else {
    visible.value = false;
    currentEventIndex.value = 0;
    gameStore.clearPendingRandomEvents();
  }
}

function startCountdown() {
  countdown.value = 3;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = window.setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) {
      handleClose();
    }
  }, 1000);
}

function handleClose() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  currentEventIndex.value++;
  if (currentEventIndex.value < pendingRandomEvents.value.length) {
    showNextEvent();
  } else {
    visible.value = false;
    currentEventIndex.value = 0;
    gameStore.clearPendingRandomEvents();
  }
}

watch(
  () => pendingRandomEvents.value.length,
  (newLength) => {
    if (newLength > 0 && !visible.value) {
      currentEventIndex.value = 0;
      showNextEvent();
    }
  }
);

onMounted(() => {
  if (pendingRandomEvents.value.length > 0) {
    currentEventIndex.value = 0;
    showNextEvent();
  }
});

onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
});
</script>

<style scoped>
.event-notification-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.event-notification {
  background: white;
  border-radius: 16px;
  width: 480px;
  max-width: 90vw;
  position: relative;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  border-top: 4px solid #4CAF50;
}

.event-notification.severity-1 {
  border-top-color: #4CAF50;
}

.event-notification.severity-2 {
  border-top-color: #FF9800;
}

.event-notification.severity-3 {
  border-top-color: #F44336;
}

.event-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px 16px;
  background: linear-gradient(135deg, #f5f5f5 0%, #e8f5e9 100%);
  border-bottom: 1px solid #e0e0e0;
}

.event-icon {
  font-size: 36px;
}

.event-type {
  font-size: 20px;
  font-weight: bold;
  color: #333;
  flex: 1;
}

.severity-badges {
  display: flex;
  gap: 4px;
}

.severity-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #e0e0e0;
  transition: all 0.3s;
}

.severity-dot.active {
  background: #F44336;
  box-shadow: 0 0 8px rgba(244, 67, 54, 0.5);
}

.severity-1 .severity-dot.active {
  background: #4CAF50;
  box-shadow: 0 0 8px rgba(76, 175, 80, 0.5);
}

.severity-2 .severity-dot.active {
  background: #FF9800;
  box-shadow: 0 0 8px rgba(255, 152, 0, 0.5);
}

.event-body {
  padding: 24px;
}

.event-description {
  font-size: 16px;
  line-height: 1.6;
  color: #555;
  margin: 0;
}

.event-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #fafafa;
  border-top: 1px solid #e0e0e0;
}

.affected-players {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.affected-players .label {
  color: #888;
  font-weight: 500;
}

.affected-players .players {
  color: #333;
  font-weight: 500;
}

.countdown {
  font-size: 13px;
  color: #999;
}

.close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(0, 0, 0, 0.2);
  color: #333;
}

.event-popup-enter-active,
.event-popup-leave-active {
  transition: all 0.3s ease;
}

.event-popup-enter-from {
  opacity: 0;
}

.event-popup-leave-to {
  opacity: 0;
}

.event-popup-enter-from .event-notification,
.event-popup-leave-to .event-notification {
  transform: scale(0.8) translateY(-20px);
  opacity: 0;
}
</style>
