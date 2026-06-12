import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { GameState, PlayerState, LeaderboardEntry, PlantSpecies, InteractionInfo, PlayerAction } from '../types/game';

export const useGameStore = defineStore('game', () => {
  const gameState = ref<GameState | null>(null);
  const currentPlayerId = ref('');
  const allSpecies = ref<{ [id: string]: PlantSpecies }>({});
  const ecologyInteractions = ref<InteractionInfo[]>([]);
  const leaderboard = ref<LeaderboardEntry[]>([]);
  const turnEvents = ref<string[]>([]);
  const pendingActions = ref<PlayerAction[]>([]);

  const currentPlayer = computed<PlayerState | null>(() => {
    if (!gameState.value || !currentPlayerId.value) return null;
    return gameState.value.players[currentPlayerId.value] || null;
  });

  const isHost = computed(() => {
    return gameState.value?.hostId === currentPlayerId.value;
  });

  const isMyTurnReady = computed(() => {
    return currentPlayer.value?.actionsSubmitted || false;
  });

  const allPlayersReady = computed(() => {
    if (!gameState.value) return false;
    return Object.values(gameState.value.players).every(
      p => p.isBankrupt || p.actionsSubmitted
    );
  });

  function setGameState(state: GameState) {
    gameState.value = state;
  }

  function setCurrentPlayer(id: string) {
    currentPlayerId.value = id;
  }

  function setPlantsData(species: { [id: string]: PlantSpecies }, interactions: InteractionInfo[]) {
    allSpecies.value = { ...species, ...(gameState.value?.allSpecies || {}) };
    ecologyInteractions.value = interactions;
  }

  function setLeaderboard(entries: LeaderboardEntry[]) {
    leaderboard.value = entries;
  }

  function addTurnEvents(events: string[]) {
    turnEvents.value = [...turnEvents.value, ...events];
  }

  function clearTurnEvents() {
    turnEvents.value = [];
  }

  function addPendingAction(action: PlayerAction) {
    pendingActions.value.push(action);
  }

  function clearPendingActions() {
    pendingActions.value = [];
  }

  function removePendingAction(index: number) {
    pendingActions.value.splice(index, 1);
  }

  function reset() {
    gameState.value = null;
    currentPlayerId.value = '';
    leaderboard.value = [];
    turnEvents.value = [];
    pendingActions.value = [];
  }

  return {
    gameState,
    currentPlayerId,
    allSpecies,
    ecologyInteractions,
    leaderboard,
    turnEvents,
    pendingActions,
    currentPlayer,
    isHost,
    isMyTurnReady,
    allPlayersReady,
    setGameState,
    setCurrentPlayer,
    setPlantsData,
    setLeaderboard,
    addTurnEvents,
    clearTurnEvents,
    addPendingAction,
    clearPendingActions,
    removePendingAction,
    reset
  };
});
