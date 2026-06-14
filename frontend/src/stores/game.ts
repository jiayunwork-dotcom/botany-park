import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  GameState,
  PlayerState,
  LeaderboardEntry,
  PlantSpecies,
  InteractionInfo,
  PlayerAction,
  WeatherForecast,
  RandomEvent,
  Plot,
  MicroClimate,
  MarketOrder,
  MarketSpeciesStats,
  Negotiation,
  Auction,
  AuctionSettlementResult
} from '../types/game';

export interface SeedSuitability {
  speciesId: string;
  speciesName: string;
  icon: string;
  score: number;
  recommendation: string;
}

const SEASON_CONFIG = {
  spring: { light: 60, tempModifier: 0, name: '春季', icon: '🌸', description: '光照适中，温度适宜，植物生长开始活跃' },
  summer: { light: 90, tempModifier: 10, name: '夏季', icon: '☀️', description: '光照充足，高温，植物生长快但水分消耗大' },
  autumn: { light: 50, tempModifier: -5, name: '秋季', icon: '🍂', description: '光照减少，温度下降，部分植物进入休眠准备' },
  winter: { light: 30, tempModifier: -15, name: '冬季', icon: '❄️', description: '光照不足，低温，大部分植物生长缓慢或休眠' }
};

const BASE_TEMPERATURE = 20;

export const useGameStore = defineStore('game', () => {
  const gameState = ref<GameState | null>(null);
  const currentPlayerId = ref('');
  const allSpecies = ref<{ [id: string]: PlantSpecies }>({});
  const ecologyInteractions = ref<InteractionInfo[]>([]);
  const leaderboard = ref<LeaderboardEntry[]>([]);
  const turnEvents = ref<string[]>([]);
  const pendingActions = ref<PlayerAction[]>([]);
  const weatherForecast = ref<WeatherForecast | null>(null);
  const pendingRandomEvents = ref<RandomEvent[]>([]);
  const marketOrders = ref<MarketOrder[]>([]);
  const marketStats = ref<MarketSpeciesStats[]>([]);
  const publicFunds = ref(0);
  const tradeTaxRate = ref(0.05);
  const pendingNegotiations = ref<Negotiation[]>([]);
  const auctions = ref<Auction[]>([]);
  const recentAuctionSettlements = ref<AuctionSettlementResult[]>([]);

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

  const seasonConfig = computed(() => {
    if (!gameState.value) return SEASON_CONFIG.spring;
    return SEASON_CONFIG[gameState.value.season] || SEASON_CONFIG.spring;
  });

  const nextSeasonConfig = computed(() => {
    if (!gameState.value) return SEASON_CONFIG.summer;
    const seasons = ['spring', 'summer', 'autumn', 'winter'];
    const idx = seasons.indexOf(gameState.value.season);
    const nextIdx = (idx + 1) % 4;
    return SEASON_CONFIG[seasons[nextIdx] as keyof typeof SEASON_CONFIG];
  });

  function calculateEnvironmentFactor(
    value: number,
    minOptimal: number,
    maxOptimal: number
  ): number {
    if (value >= minOptimal && value <= maxOptimal) {
      return 1;
    }
    const center = (minOptimal + maxOptimal) / 2;
    const range = (maxOptimal - minOptimal) / 2;
    const distance = Math.abs(value - center);
    const sigma = range * 1.5;
    return Math.exp(-(distance * distance) / (2 * sigma * sigma));
  }

  function getEffectiveClimate(plot: Plot): {
    light: number;
    temp: number;
    humidity: number;
    ph: number;
  } {
    if (!gameState.value) {
      return { light: 50, temp: 20, humidity: 50, ph: 6.5 };
    }

    const seasonConfigData = SEASON_CONFIG[gameState.value.season];
    let light = plot.climate.light * 0.3 + seasonConfigData.light * 0.7;
    let temp = BASE_TEMPERATURE + seasonConfigData.tempModifier;

    if (plot.type === 'greenhouse') {
      light *= 0.7;
      temp = 20;
    }

    return {
      light,
      temp,
      humidity: plot.climate.humidity,
      ph: plot.climate.ph
    };
  }

  function calculateSuitability(speciesId: string, plot: Plot): number {
    const species = allSpecies.value[speciesId];
    if (!species) return 0;

    const climate = getEffectiveClimate(plot);
    const lightFactor = calculateEnvironmentFactor(
      climate.light, species.lightRange[0], species.lightRange[1]
    );
    const waterFactor = calculateEnvironmentFactor(
      climate.humidity, species.waterRange[0], species.waterRange[1]
    );
    const tempFactor = calculateEnvironmentFactor(
      climate.temp, species.tempRange[0], species.tempRange[1]
    );
    const phFactor = calculateEnvironmentFactor(
      climate.ph, species.phRange[0], species.phRange[1]
    );

    const score = Math.round((lightFactor * waterFactor * tempFactor * phFactor) * 100);
    return Math.max(0, Math.min(100, score));
  }

  function getSeedSuitabilityList(): SeedSuitability[] {
    if (!currentPlayer.value) return [];

    const ownedSeeds = Object.keys(currentPlayer.value.ownedSeeds).filter(
      id => currentPlayer.value!.ownedSeeds[id] > 0
    );

    const result: SeedSuitability[] = [];

    for (const speciesId of ownedSeeds) {
      const species = allSpecies.value[speciesId];
      if (!species) continue;

      const plots = currentPlayer.value.plots;
      let maxScore = 0;

      for (let y = 0; y < plots.length; y++) {
        for (let x = 0; x < plots[y].length; x++) {
          const plot = plots[y][x];
          if (plot.plant || plot.constructionTurnsLeft > 0) continue;
          if (plot.type === 'path' || plot.type === 'exhibition' || plot.type === 'pavilion') continue;

          const score = calculateSuitability(speciesId, plot);
          if (score > maxScore) {
            maxScore = score;
          }
        }
      }

      let recommendation = '';
      if (maxScore >= 80) {
        recommendation = '非常适合';
      } else if (maxScore >= 60) {
        recommendation = '适合';
      } else if (maxScore >= 50) {
        recommendation = '一般';
      } else {
        recommendation = '不推荐本季种植';
      }

      result.push({
        speciesId,
        speciesName: species.name,
        icon: species.icon,
        score: maxScore,
        recommendation
      });
    }

    return result.sort((a, b) => b.score - a.score);
  }

  function setGameState(state: GameState) {
    gameState.value = JSON.parse(JSON.stringify(state));
    if (state.allSpecies) {
      allSpecies.value = { ...allSpecies.value, ...state.allSpecies };
    }
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

  function setWeatherForecast(forecast: WeatherForecast) {
    weatherForecast.value = forecast;
  }

  function addPendingRandomEvent(event: RandomEvent) {
    pendingRandomEvents.value.push(event);
  }

  function clearPendingRandomEvents() {
    pendingRandomEvents.value = [];
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

  const myOrders = computed(() => {
    if (!currentPlayerId.value) return [];
    return marketOrders.value.filter(o => o.sellerId === currentPlayerId.value);
  });

  const activeAuctions = computed(() => {
    return auctions.value.filter(a => a.status === 'active');
  });

  const myCreatedAuctions = computed(() => {
    if (!currentPlayerId.value) return [];
    return auctions.value.filter(a => a.sellerId === currentPlayerId.value);
  });

  const myParticipatedAuctions = computed(() => {
    if (!currentPlayerId.value) return [];
    return auctions.value.filter(a =>
      a.bids.some(b => b.bidderId === currentPlayerId.value) || a.sellerId === currentPlayerId.value
    );
  });

  function getMyHighestBid(auctionId: string): number {
    if (!currentPlayerId.value) return 0;
    const auction = auctions.value.find(a => a.id === auctionId);
    if (!auction) return 0;
    const myBids = auction.bids.filter(b => b.bidderId === currentPlayerId.value);
    if (myBids.length === 0) return 0;
    return Math.max(...myBids.map(b => b.amount));
  }

  function isLeadingBid(auctionId: string): boolean {
    if (!currentPlayerId.value) return false;
    const auction = auctions.value.find(a => a.id === auctionId);
    if (!auction) return false;
    return auction.currentHighBidderId === currentPlayerId.value;
  }

  function setAuctions(newAuctions: Auction[]) {
    auctions.value = newAuctions;
  }

  function addAuctionSettlement(result: AuctionSettlementResult) {
    recentAuctionSettlements.value.unshift(result);
    if (recentAuctionSettlements.value.length > 50) {
      recentAuctionSettlements.value = recentAuctionSettlements.value.slice(0, 50);
    }
  }

  function setMarketOrders(orders: MarketOrder[]) {
    marketOrders.value = orders;
  }

  function setMarketStats(stats: MarketSpeciesStats[]) {
    marketStats.value = stats;
  }

  function setPublicFunds(funds: number) {
    publicFunds.value = funds;
  }

  function setTradeTaxRate(rate: number) {
    tradeTaxRate.value = rate;
  }

  function addPendingNegotiation(negotiation: Negotiation) {
    pendingNegotiations.value.push(negotiation);
  }

  function removePendingNegotiation(negotiationId: string) {
    pendingNegotiations.value = pendingNegotiations.value.filter(n => n.id !== negotiationId);
  }

  function reset() {
    gameState.value = null;
    currentPlayerId.value = '';
    leaderboard.value = [];
    turnEvents.value = [];
    pendingActions.value = [];
    weatherForecast.value = null;
    pendingRandomEvents.value = [];
    marketOrders.value = [];
    marketStats.value = [];
    publicFunds.value = 0;
    tradeTaxRate.value = 0.05;
    pendingNegotiations.value = [];
    auctions.value = [];
    recentAuctionSettlements.value = [];
  }

  return {
    gameState,
    currentPlayerId,
    allSpecies,
    ecologyInteractions,
    leaderboard,
    turnEvents,
    pendingActions,
    weatherForecast,
    pendingRandomEvents,
    marketOrders,
    marketStats,
    publicFunds,
    tradeTaxRate,
    pendingNegotiations,
    auctions,
    recentAuctionSettlements,
    currentPlayer,
    isHost,
    isMyTurnReady,
    allPlayersReady,
    seasonConfig,
    nextSeasonConfig,
    myOrders,
    activeAuctions,
    myCreatedAuctions,
    myParticipatedAuctions,
    setGameState,
    setCurrentPlayer,
    setPlantsData,
    setLeaderboard,
    setWeatherForecast,
    setMarketOrders,
    setMarketStats,
    setPublicFunds,
    setTradeTaxRate,
    setAuctions,
    addAuctionSettlement,
    getMyHighestBid,
    isLeadingBid,
    addPendingRandomEvent,
    clearPendingRandomEvents,
    addTurnEvents,
    clearTurnEvents,
    addPendingAction,
    clearPendingActions,
    removePendingAction,
    addPendingNegotiation,
    removePendingNegotiation,
    reset,
    calculateSuitability,
    getSeedSuitabilityList,
    getEffectiveClimate
  };
});
