import { Module } from '@nestjs/common';
import { BotControlController } from './bot-control.controller';

@Module({
  controllers: [BotControlController],
})
export class BotControlModule {}
