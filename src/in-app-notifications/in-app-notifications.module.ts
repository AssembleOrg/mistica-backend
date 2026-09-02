import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  InAppNotification,
  InAppNotificationSchema,
} from '../common/schemas/in-app-notification.schema';
import { InAppNotificationsController } from './in-app-notifications.controller';
import { InAppNotificationsService } from './in-app-notifications.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: InAppNotification.name, schema: InAppNotificationSchema }])],
  controllers: [InAppNotificationsController],
  providers: [InAppNotificationsService],
  exports: [InAppNotificationsService],
})
export class InAppNotificationsModule {}
