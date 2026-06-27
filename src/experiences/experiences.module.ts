import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Experience,
  ExperienceSchema,
  ExperienceSession,
  ExperienceSessionSchema,
} from '../common/schemas';
import { ReservationsModule } from '../reservations/reservations.module';
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
  ],
  controllers: [
    ExperiencesController,
    ExperienceSessionsController,
    ReservationsAdminController,
  ],
  providers: [ExperiencesService],
})
export class ExperiencesModule {}
