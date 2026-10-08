import { Module } from '@nestjs/common';
import { TrialClass, TrialClassSchema } from '../common/schemas/trial-class.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { Group, GroupSchema } from '../common/schemas/group.schema';
import {
  Professor,
  ProfessorSchema,
} from '../common/schemas/professor.schema';
import { Student, StudentSchema } from '../common/schemas/student.schema';
import { Client, ClientSchema } from '../common/schemas/client.schema';
import {
  Reservation,
  ReservationSchema,
} from '../common/schemas/reservation.schema';
import {
  MakeupClass,
  MakeupClassSchema,
} from '../common/schemas/makeup-class.schema';
import {
  ExtraClass,
  ExtraClassSchema,
} from '../common/schemas/extra-class.schema';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Group.name, schema: GroupSchema },
      { name: Professor.name, schema: ProfessorSchema },
      { name: Student.name, schema: StudentSchema },
      { name: Client.name, schema: ClientSchema },
      { name: TrialClass.name, schema: TrialClassSchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: MakeupClass.name, schema: MakeupClassSchema },
      { name: ExtraClass.name, schema: ExtraClassSchema },
    ]),
  ],
  controllers: [GroupsController],
  providers: [GroupsService, AllowedViewsGuard],
  exports: [GroupsService],
})
export class GroupsModule {}
