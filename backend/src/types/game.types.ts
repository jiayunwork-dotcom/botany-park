export enum PlotType {
  NORMAL = 'normal',
  GREENHOUSE = 'greenhouse',
  POND = 'pond',
  ROCK = 'rock',
  PATH = 'path',
  EXHIBITION = 'exhibition',
  PAVILION = 'pavilion'
}

export enum PlantCategory {
  TREE = 'tree',
  SHRUB = 'shrub',
  HERB = 'herb',
  VINE = 'vine',
  AQUATIC = 'aquatic',
  SUCCULENT = 'succulent'
}

export enum Season {
  SPRING = 'spring',
  SUMMER = 'summer',
  AUTUMN = 'autumn',
  WINTER = 'winter'
}

export enum GamePhase {
  WAITING = 'waiting',
  PLAYING = 'playing',
  FINISHED = 'finished'
}

export enum Rarity {
  COMMON = 'common',
  UNCOMMON = 'uncommon',
  RARE = 'rare',
  EPIC = 'epic',
  LEGENDARY = 'legendary'
}

export interface MicroClimate {
  light: number;
  humidity: number;
  ph: number;
  wind: number;
}

export interface Plot {
  id: string;
  x: number;
  y: number;
  type: PlotType;
  plant: PlantInstance | null;
  climate: MicroClimate;
  constructionTurnsLeft: number;
  newType: PlotType | null;
}

export interface PlantSpecies {
  id: string;
  name: string;
  category: PlantCategory;
  icon: string;
  lightRange: [number, number];
  waterRange: [number, number];
  tempRange: [number, number];
  phRange: [number, number];
  growthRate: number;
  baseValue: number;
  bloomMonths: number[];
  lifespan: number;
  rarity: Rarity;
  price: number;
  description: string;
  pollinationPartners?: string[];
  symbiosisPartners?: string[];
  competitionGroup?: string;
  allelopathyTargets?: string[];
}

export interface PlantInstance {
  speciesId: string;
  health: number;
  biomass: number;
  maxBiomass: number;
  age: number;
  isBlooming: boolean;
  growthModifier: number;
  isWild: boolean;
  domesticationTurns: number;
}

export interface PlayerAction {
  type: 'plant' | 'remove' | 'upgrade' | 'set_ticket' | 'research' | 'trade' | 'sell_seed';
  data: any;
}

export interface PlayerState {
  id: string;
  name: string;
  socketId: string;
  money: number;
  debtTurns: number;
  isBankrupt: boolean;
  ticketPrice: number;
  plots: Plot[][];
  ownedSeeds: { [speciesId: string]: number };
  researchProjects: ResearchProject[];
  discoveredSpecies: string[];
  actions: PlayerAction[];
  lastTurnSnapshot: string | null;
  endangeredPlants: { speciesId: string; turnsLeft: number }[];
}

export interface ResearchProject {
  id: string;
  type: 'hybrid' | 'domestication' | 'endangered';
  parent1Id?: string;
  parent2Id?: string;
  wildSpeciesId?: string;
  endangeredSpeciesId?: string;
  turnsLeft: number;
  totalTurns: number;
}

export interface SeedShopItem {
  speciesId: string;
  stock: number;
  price: number;
}

export interface SeasonEnvironment {
  light: number;
  tempModifier: number;
  temp: number;
}

export interface WeatherForecast {
  currentSeason: Season;
  currentSeasonName: string;
  currentEnvironment: SeasonEnvironment;
  nextSeason: Season;
  nextSeasonName: string;
  nextEnvironment: SeasonEnvironment;
  seasonProgress: number;
}

export interface RandomEvent {
  type: 'pest' | 'weather' | 'media' | 'policy';
  severity: number;
  description: string;
  affects: string[];
  affectedPlayerNames?: string[];
  icon: string;
}

export interface TurnResult {
  game: GameState;
  events: string[];
  randomEvents: RandomEvent[];
  weatherForecast: WeatherForecast;
}

export interface GameState {
  id: string;
  phase: GamePhase;
  turn: number;
  maxTurns: number;
  season: Season;
  players: { [playerId: string]: PlayerState };
  playerOrder: string[];
  hostId: string;
  seedShop: { [playerId: string]: SeedShopItem[] };
  currentEvents: RandomEvent[];
  cityTouristBase: number;
  actionsSubmitted: { [playerId: string]: boolean };
  allSpecies: { [speciesId: string]: PlantSpecies };
  lastUpdate: number;
}

export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  offerSeeds: { speciesId: string; quantity: number }[];
  offerMoney: number;
  requestSeeds: { speciesId: string; quantity: number }[];
  requestMoney: number;
  expiresAtTurn: number;
}

export interface FlowerShow {
  id: string;
  season: Season;
  participants: string[];
  theme: PlantCategory | null;
  requiredPlants: { [speciesId: string]: number };
  rewards: { rank: number; money: number; reputation: number }[];
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  score: number;
  plantValue: number;
  money: number;
  diversity: number;
  research: number;
  satisfaction: number;
}

export enum MarketOrderStatus {
  ACTIVE = 'active',
  SOLD = 'sold',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}

export interface MarketOrder {
  id: string;
  sellerId: string;
  sellerName: string;
  speciesId: string;
  quantity: number;
  unitPrice: number;
  createdAtTurn: number;
  turnsLeft: number;
  status: MarketOrderStatus;
}
