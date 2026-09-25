import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  BotFaq,
  BotFaqSchema,
  BotSettings,
  BotSettingsSchema,
} from '../common/schemas';
import {
  BotSettingsAdminController,
  BotSettingsInternalController,
} from './bot-settings.controller';
import { BotSettingsService } from './bot-settings.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BotSettings.name, schema: BotSettingsSchema },
      { name: BotFaq.name, schema: BotFaqSchema },
    ]),
  ],
  controllers: [BotSettingsAdminController, BotSettingsInternalController],
  providers: [BotSettingsService],
  exports: [BotSettingsService],
})
export class BotSettingsModule {}
