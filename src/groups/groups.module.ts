import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Group, GroupSchema } from '../common/schemas/group.schema';
import {
  Professor,
  ProfessorSchema,
} from '../common/schemas/professor.schema';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Group.name, schema: GroupSchema },
      { name: Professor.name, schema: ProfessorSchema },
    ]),
  ],
  controllers: [GroupsController],
  providers: [GroupsService, AllowedViewsGuard],
  exports: [GroupsService],
})
export class GroupsModule {}
