import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Experience,
  ExperienceSchema,
  ExperienceSession,
  ExperienceSessionSchema,
} from '../common/schemas';
import { ReservationsModule } from '../reservations/reservations.module';
import { ClosedDatesModule } from '../closed-dates/closed-dates.module';
import { ExperienceSessionsController } from './experience-sessions.controller';
import { ExperiencesController } from './experiences.controller';
import { ExperiencesService } from './experiences.service';
import { ReservationsAdminController } from './reservations-admin.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Experience.name, schema: ExperienceSchema },
      { name: ExperienceSession.name, schema: ExperienceSessionSchema },
    ]),
    ReservationsModule,
    ClosedDatesModule,
  ],
  controllers: [
    ExperiencesController,
    ExperienceSessionsController,
    ReservationsAdminController,
  ],
  providers: [ExperiencesService],
})
export class ExperiencesModule {}
