import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Lead, LeadSchema } from '../common/schemas/lead.schema';
import {
  Reservation,
  ReservationSchema,
} from '../common/schemas/reservation.schema';
import { SpacesService } from '../common/services/spaces.service';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: Reservation.name, schema: ReservationSchema },
    ]),
  ],
  controllers: [LeadsController],
  providers: [LeadsService, SpacesService],
  exports: [LeadsService],
})
export class LeadsModule {}
