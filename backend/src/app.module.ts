import { Module } from '@nestjs/common';
import { RedisService } from './services/redis.service';
import { GameFactoryService } from './services/game-factory.service';
import { GameEngineService } from './services/game-engine.service';
import { GameStateService } from './services/game-state.service';
import { TradeService } from './services/trade.service';
import { GameGateway } from './gateways/game.gateway';

@Module({
  imports: [],
  controllers: [],
  providers: [
    RedisService,
    GameFactoryService,
    GameEngineService,
    GameStateService,
    TradeService,
    GameGateway
  ]
})
export class AppModule {}
