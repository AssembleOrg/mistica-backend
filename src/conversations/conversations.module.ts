import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Conversation,
  ConversationSchema,
  ConversationMessage,
  ConversationMessageSchema,
} from '../common/schemas';
import { NotificationsModule } from '../notifications/notifications.module';
import { BotHandoffService } from './bot-handoff.service';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: ConversationMessage.name, schema: ConversationMessageSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService, BotHandoffService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
