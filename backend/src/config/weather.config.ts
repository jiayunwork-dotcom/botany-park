import { Season } from '../types/game.types';

export enum WeatherType {
  SUNNY = 'sunny',
  CLOUDY = 'cloudy',
  RAINSTORM = 'rainstorm',
  DROUGHT = 'drought',
  FROST = 'frost',
  TYPHOON = 'typhoon',
  PEST = 'pest'
}

export interface WeatherConfig {
  name: string;
  icon: string;
  description: string;
  severity: number;
}

export const WEATHER_CONFIG: { [key in WeatherType]: WeatherConfig } = {
  [WeatherType.SUNNY]: {
    name: '晴天',
    icon: '☀️',
    description: '阳光明媚，适合植物生长',
    severity: 0
  },
  [WeatherType.CLOUDY]: {
    name: '阴天',
    icon: '☁️',
    description: '多云天气，光照略减',
    severity: 0
  },
  [WeatherType.RAINSTORM]: {
    name: '暴雨',
    icon: '⛈️',
    description: '持续暴雨，土壤过湿，草本植物易受涝害',
    severity: 2
  },
  [WeatherType.DROUGHT]: {
    name: '干旱',
    icon: '🏜️',
    description: '持续高温少雨，水分蒸发加剧，需水量大的植物受影响严重',
    severity: 2
  },
  [WeatherType.FROST]: {
    name: '霜冻',
    icon: '🧊',
    description: '气温骤降，热带植物和娇嫩花卉易受冻害',
    severity: 3
  },
  [WeatherType.TYPHOON]: {
    name: '台风',
    icon: '🌀',
    description: '强风暴雨，高大乔木易倒伏',
    severity: 3
  },
  [WeatherType.PEST]: {
    name: '虫害',
    icon: '🐛',
    description: '虫害爆发，随机感染多株植物',
    severity: 2
  }
};

export interface SeasonWeatherProbability {
  [WeatherType.SUNNY]: number;
  [WeatherType.CLOUDY]: number;
  [WeatherType.RAINSTORM]: number;
  [WeatherType.DROUGHT]: number;
  [WeatherType.FROST]: number;
  [WeatherType.TYPHOON]: number;
  [WeatherType.PEST]: number;
}

export const WEATHER_PROBABILITY_BY_SEASON: { [key in Season]: SeasonWeatherProbability } = {
  [Season.SPRING]: {
    [WeatherType.SUNNY]: 0.35,
    [WeatherType.CLOUDY]: 0.25,
    [WeatherType.RAINSTORM]: 0.15,
    [WeatherType.DROUGHT]: 0.05,
    [WeatherType.FROST]: 0.05,
    [WeatherType.TYPHOON]: 0.02,
    [WeatherType.PEST]: 0.13
  },
  [Season.SUMMER]: {
    [WeatherType.SUNNY]: 0.30,
    [WeatherType.CLOUDY]: 0.15,
    [WeatherType.RAINSTORM]: 0.15,
    [WeatherType.DROUGHT]: 0.15,
    [WeatherType.FROST]: 0.0,
    [WeatherType.TYPHOON]: 0.10,
    [WeatherType.PEST]: 0.15
  },
  [Season.AUTUMN]: {
    [WeatherType.SUNNY]: 0.30,
    [WeatherType.CLOUDY]: 0.30,
    [WeatherType.RAINSTORM]: 0.10,
    [WeatherType.DROUGHT]: 0.10,
    [WeatherType.FROST]: 0.05,
    [WeatherType.TYPHOON]: 0.05,
    [WeatherType.PEST]: 0.10
  },
  [Season.WINTER]: {
    [WeatherType.SUNNY]: 0.25,
    [WeatherType.CLOUDY]: 0.30,
    [WeatherType.RAINSTORM]: 0.05,
    [WeatherType.DROUGHT]: 0.10,
    [WeatherType.FROST]: 0.20,
    [WeatherType.TYPHOON]: 0.0,
    [WeatherType.PEST]: 0.10
  }
};

export const DISASTER_DAMAGE = {
  LIGHT: 20,
  HEAVY: 50
};

export const INSURANCE_CONFIG = {
  PREMIUM_RATE: 0.15,
  PAYOUT_RATE: 0.80,
  DURATION_TURNS: 5
};
