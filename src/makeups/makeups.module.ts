import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Attendance,
  AttendanceSchema,
} from '../common/schemas/attendance.schema';
import { Group, GroupSchema } from '../common/schemas/group.schema';
import {
  MakeupClass,
  MakeupClassSchema,
} from '../common/schemas/makeup-class.schema';
import { Student, StudentSchema } from '../common/schemas/student.schema';
import {
  ExtraClass,
  ExtraClassSchema,
} from '../common/schemas/extra-class.schema';
import { User, UserSchema } from '../common/schemas/user.schema';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';
import { MakeupsController } from './makeups.controller';
import { MakeupsService } from './makeups.service';
import { ExtraClassesController } from './extra-classes.controller';
import { ExtraClassesService } from './extra-classes.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MakeupClass.name, schema: MakeupClassSchema },
      { name: Attendance.name, schema: AttendanceSchema },
      { name: Group.name, schema: GroupSchema },
      { name: Student.name, schema: StudentSchema },
      { name: User.name, schema: UserSchema },
      { name: ExtraClass.name, schema: ExtraClassSchema },
    ]),
  ],
  controllers: [MakeupsController, ExtraClassesController],
  providers: [MakeupsService, ExtraClassesService, AllowedViewsGuard],
  exports: [MakeupsService, ExtraClassesService],
})
export class MakeupsModule {}
