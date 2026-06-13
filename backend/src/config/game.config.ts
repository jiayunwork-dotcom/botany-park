import { PlotType } from '../types/game.types';

export const GAME_CONFIG = {
  GRID_SIZE: 12,
  MAX_TURNS: 20,
  TURNS_PER_YEAR: 4,
  INITIAL_MONEY: 10000,
  BASE_EMPLOYEE_SALARY: 100,
  SALARY_PER_10_PLANTS: 50,
  MAX_DEBT_TURNS: 3,
  CITY_TOURIST_BASE: 2000,
  MIN_PLAYERS: 4,
  MAX_PLAYERS: 6,

  PLOT_CONSTRUCTION: {
    [PlotType.NORMAL]: { cost: 0, turns: 0 },
    [PlotType.GREENHOUSE]: { cost: 500, turns: 1 },
    [PlotType.POND]: { cost: 800, turns: 1 },
    [PlotType.ROCK]: { cost: 300, turns: 1 },
    [PlotType.PATH]: { cost: 150, turns: 1 },
    [PlotType.EXHIBITION]: { cost: 600, turns: 1 },
    [PlotType.PAVILION]: { cost: 400, turns: 1 }
  },

  PLOT_MAINTENANCE: {
    [PlotType.NORMAL]: 0,
    [PlotType.GREENHOUSE]: 30,
    [PlotType.POND]: 25,
    [PlotType.ROCK]: 10,
    [PlotType.PATH]: 5,
    [PlotType.EXHIBITION]: 15,
    [PlotType.PAVILION]: 10
  },

  PLANT_CARE_COST: {
    tree: 15,
    shrub: 8,
    herb: 4,
    vine: 6,
    aquatic: 10,
    succulent: 3
  },

  RESEARCH: {
    HYBRID_TURNS: 3,
    HYBRID_COST: 500,
    DOMESTICATION_TURNS: 3,
    DOMESTICATION_COST_PER_TURN: 80,
    ENDANGERED_TURNS: 3,
    ENDANGERED_REWARD: 1500,
    MUTATION_CHANCE: 0.1
  },

  SEASON: {
    spring: {
      light: 60,
      tempModifier: 0,
      name: '春季',
      icon: '🌸',
      description: '光照适中，温度适宜，植物生长开始活跃'
    },
    summer: {
      light: 90,
      tempModifier: 10,
      name: '夏季',
      icon: '☀️',
      description: '光照充足，高温，植物生长快但水分消耗大'
    },
    autumn: {
      light: 50,
      tempModifier: -5,
      name: '秋季',
      icon: '🍂',
      description: '光照减少，温度下降，部分植物进入休眠准备'
    },
    winter: {
      light: 30,
      tempModifier: -15,
      name: '冬季',
      icon: '❄️',
      description: '光照不足，低温，大部分植物生长缓慢或休眠'
    }
  },

  RANDOM_EVENT_ICONS: {
    pest: '🐛',
    weather: '⛈️',
    media: '📰',
    policy: '📋'
  },

  BASE_TEMPERATURE: 20,

  GREENHOUSE: {
    lightModifier: 0.7,
    tempStable: 20
  },

  DEAD_PLANT_TURNS: 1,
  BLOOM_VALUE_MULTIPLIER: 2,
  MIN_HEALTH_TO_BLOOM: 60,

  TICKET_PRICE: {
    min: 10,
    max: 200,
    default: 50,
    elasticity: 0.02
  },

  FLOWER_SHOW: {
    1: { money: 1000, reputation: 50 },
    2: { money: 600, reputation: 30 },
    3: { money: 300, reputation: 15 }
  }
};
