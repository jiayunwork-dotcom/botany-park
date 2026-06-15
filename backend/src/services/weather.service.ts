import { Injectable } from '@nestjs/common';
import { Season, WeatherEvent, WeatherType, NextTurnForecast } from '../types/game.types';
import { WEATHER_CONFIG, WEATHER_PROBABILITY_BY_SEASON } from '../config/weather.config';

@Injectable()
export class WeatherService {
  private seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  generateWeather(season: Season, turn: number, gameSeed: number): WeatherEvent {
    const seed = gameSeed + turn * 1000 + season.charCodeAt(0);
    const random = this.seededRandom(seed);

    const probabilities = WEATHER_PROBABILITY_BY_SEASON[season];
    const weatherTypes = Object.values(WeatherType);

    let cumulative = 0;
    const rand = random();

    for (const type of weatherTypes) {
      const prob = probabilities[type] || 0;
      cumulative += prob;
      if (rand <= cumulative) {
        const config = WEATHER_CONFIG[type];
        return {
          type,
          name: config.name,
          icon: config.icon,
          description: config.description,
          severity: config.severity,
          turn,
          season
        };
      }
    }

    const defaultConfig = WEATHER_CONFIG[WeatherType.SUNNY];
    return {
      type: WeatherType.SUNNY,
      name: defaultConfig.name,
      icon: defaultConfig.icon,
      description: defaultConfig.description,
      severity: defaultConfig.severity,
      turn,
      season
    };
  }

  generateForecast(
    season: Season,
    nextTurn: number,
    gameSeed: number
  ): NextTurnForecast {
    const actualWeather = this.generateWeather(season, nextTurn, gameSeed);
    const forecastAccuracy = 0.7;
    const rand = Math.random();

    if (rand < forecastAccuracy) {
      return {
        weatherType: actualWeather.type,
        weatherName: actualWeather.name,
        weatherIcon: actualWeather.icon,
        severity: actualWeather.severity,
        isDisaster: actualWeather.severity > 0,
        accuracy: forecastAccuracy
      };
    }

    const allTypes = Object.values(WeatherType);
    const otherTypes = allTypes.filter(t => t !== actualWeather.type);
    const predictedType = otherTypes[Math.floor(Math.random() * otherTypes.length)];
    const predictedConfig = WEATHER_CONFIG[predictedType];

    return {
      weatherType: predictedType,
      weatherName: predictedConfig.name,
      weatherIcon: predictedConfig.icon,
      severity: predictedConfig.severity,
      isDisaster: predictedConfig.severity > 0,
      accuracy: forecastAccuracy
    };
  }

  isDisasterWeather(weather: WeatherEvent): boolean {
    return weather.severity > 0;
  }
}
