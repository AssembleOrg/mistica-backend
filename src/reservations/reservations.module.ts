import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CashboxModule } from '../cashbox/cashbox.module';
import {
  Experience,
  ExperienceSchema,
  ExperienceSession,
  ExperienceSessionSchema,
  Product,
  ProductSchema,
  Reservation,
  ReservationSchema,
  ReservationPayment,
  ReservationPaymentSchema,
} from '../common/schemas';
import { MercadopagoModule } from '../mercadopago/mercadopago.module';
import { SalesModule } from '../sales/sales.module';
import { ClosedDatesModule } from '../closed-dates/closed-dates.module';
import { TablesModule } from '../tables/tables.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsWebhookController } from './reservations-webhook.controller';
import { ReservationsService } from './reservations.service';
import { AvailabilityService } from './availability.service';
import { ReservationsCron } from './reservations.cron';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Reservation.name, schema: ReservationSchema },
      { name: ExperienceSession.name, schema: ExperienceSessionSchema },
      { name: Experience.name, schema: ExperienceSchema },
      { name: ReservationPayment.name, schema: ReservationPaymentSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    MercadopagoModule,
    CashboxModule,
    SalesModule,
    ClosedDatesModule,
    TablesModule,
  ],
  controllers: [ReservationsController, ReservationsWebhookController],
  providers: [ReservationsService, ReservationsCron, AvailabilityService],
  exports: [ReservationsService, AvailabilityService],
})
export class ReservationsModule {}
