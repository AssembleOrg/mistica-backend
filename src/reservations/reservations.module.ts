import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CashboxModule } from '../cashbox/cashbox.module';
import {
  ExperienceSession,
  ExperienceSessionSchema,
  Reservation,
  ReservationSchema,
  ReservationPayment,
  ReservationPaymentSchema,
} from '../common/schemas';
import { MercadopagoModule } from '../mercadopago/mercadopago.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsWebhookController } from './reservations-webhook.controller';
import { ReservationsService } from './reservations.service';
import { ReservationsCron } from './reservations.cron';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Reservation.name, schema: ReservationSchema },
      { name: ExperienceSession.name, schema: ExperienceSessionSchema },
      { name: ReservationPayment.name, schema: ReservationPaymentSchema },
    ]),
    MercadopagoModule,
    CashboxModule,
  ],
  controllers: [ReservationsController, ReservationsWebhookController],
  providers: [ReservationsService, ReservationsCron],
  exports: [ReservationsService],
})
export class ReservationsModule {}
