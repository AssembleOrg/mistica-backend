import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Reservation, ReservationSchema, User, UserSchema } from '../common/schemas';
import { KitchenProductionController } from './kitchen-production.controller';
import {
  KitchenProduction,
  KitchenProductionSchema,
} from './kitchen-production.schema';
import { KitchenProductionService } from './kitchen-production.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KitchenProduction.name, schema: KitchenProductionSchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [KitchenProductionController],
  providers: [KitchenProductionService],
})
export class KitchenProductionModule {}
