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
  disasterResistance?: number;
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
  insurance?: InsurancePolicy | null;
  recoveryState?: RecoveryState | null;
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
  claimRecords: InsuranceClaimRecord[];
  insuranceStats: InsuranceStats;
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
  publicFunds: number;
  tradeTaxRate: number;
  gameSeed: number;
  currentWeather: WeatherEvent | null;
  nextTurnForecast: NextTurnForecast | null;
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
  CANCELLED = 'cancelled',
  NEGOTIATING = 'negotiating'
}

export interface TradeHistoryRecord {
  id: string;
  speciesId: string;
  sellerId: string;
  buyerId: string;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  taxAmount: number;
  turn: number;
  timestamp: number;
}

export interface MarketPricePoint {
  turn: number;
  avgPrice: number;
  volume: number;
}

export interface MarketSpeciesStats {
  speciesId: string;
  avgPrice5Turns: number;
  volume5Turns: number;
  priceHistory: MarketPricePoint[];
}

export enum NegotiationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}

export interface Negotiation {
  id: string;
  orderId: string;
  buyerId: string;
  buyerName: string;
  offerPrice: number;
  status: NegotiationStatus;
  createdAt: number;
  expiresAt: number;
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
  currentNegotiation?: Negotiation | null;
}

export enum AuctionStatus {
  ACTIVE = 'active',
  SETTLED = 'settled',
  CANCELLED = 'cancelled',
  FAILED = 'failed'
}

export enum BidStatus {
  ACTIVE = 'active',
  WITHDRAWN = 'withdrawn'
}

export interface AuctionBid {
  id: string;
  auctionId: string;
  bidderId: string;
  bidderName: string;
  amount: number;
  createdAt: number;
  createdAtTurn: number;
  status: BidStatus;
  isAuto: boolean;
}

export interface ProxyBid {
  bidderId: string;
  bidderName: string;
  maxPrice: number;
  createdAt: number;
}

export interface Auction {
  id: string;
  sellerId: string;
  sellerName: string;
  speciesId: string;
  quantity: number;
  startPrice: number;
  minIncrement: number;
  totalTurns: number;
  turnsLeft: number;
  createdAtTurn: number;
  currentHighBid: number;
  currentHighBidderId: string | null;
  currentHighBidderName: string | null;
  bids: AuctionBid[];
  status: AuctionStatus;
  winnerId: string | null;
  winnerName: string | null;
  finalPrice: number | null;
  settledAtTurn: number | null;
  buyNowPrice: number | null;
  proxyBids: ProxyBid[];
  withdrawCount: { [bidderId: string]: number };
}

export interface AuctionSettlementResult {
  auctionId: string;
  success: boolean;
  winnerId: string | null;
  winnerName: string | null;
  finalPrice: number | null;
  taxAmount: number;
  sellerReceive: number;
  reason: string;
}

export enum WeatherType {
  SUNNY = 'sunny',
  CLOUDY = 'cloudy',
  RAINSTORM = 'rainstorm',
  DROUGHT = 'drought',
  FROST = 'frost',
  TYPHOON = 'typhoon',
  PEST = 'pest'
}

export interface WeatherEvent {
  type: WeatherType;
  name: string;
  icon: string;
  description: string;
  severity: number;
  turn: number;
  season: Season;
}

export enum DamageLevel {
  NONE = 'none',
  LIGHT = 'light',
  HEAVY = 'heavy',
  DEADLY = 'deadly'
}

export interface PlantDamageResult {
  plotId: string;
  x: number;
  y: number;
  speciesId: string;
  speciesName: string;
  damageLevel: DamageLevel;
  healthChange: number;
  healthBefore: number;
  healthAfter: number;
  died: boolean;
  insurancePayout?: number;
}

export interface PlayerDisasterResult {
  playerId: string;
  playerName: string;
  weatherType: WeatherType;
  damages: PlantDamageResult[];
  totalDamageCount: number;
  totalDeathCount: number;
  totalInsurancePayout: number;
}

export enum InsuranceStatus {
  NONE = 'none',
  ACTIVE = 'active',
  EXPIRED = 'expired'
}

export interface InsurancePolicy {
  id: string;
  plotId: string;
  speciesId: string;
  premium: number;
  insuredValue: number;
  payoutRate: number;
  startTurn: number;
  endTurn: number;
  status: InsuranceStatus;
}

export interface InsurancePurchaseResult {
  success: boolean;
  policy?: InsurancePolicy;
  error?: string;
  premium?: number;
  plantValue?: number;
}

export interface RecoveryState {
  isActive: boolean;
  recoveryPerTurn: number;
  originalDamageLevel: DamageLevel;
}

export interface InsuranceClaimRecord {
  turn: number;
  speciesName: string;
  disasterType: WeatherType;
  payoutAmount: number;
}

export interface InsuranceStats {
  totalPolicies: number;
  totalPremiumsPaid: number;
  totalClaimsReceived: number;
}

export interface NextTurnForecast {
  weatherType: WeatherType;
  weatherName: string;
  weatherIcon: string;
  severity: number;
  isDisaster: boolean;
  accuracy: number;
}

export interface BatchInsuranceResult {
  insured: { x: number; y: number; speciesName: string; premium: number }[];
  skipped: { x: number; y: number; speciesName: string; reason: string }[];
  totalPremium: number;
  success: boolean;
}
