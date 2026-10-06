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
    ]),
  ],
  controllers: [GroupsController],
  providers: [GroupsService, AllowedViewsGuard],
  exports: [GroupsService],
})
export class GroupsModule {}
