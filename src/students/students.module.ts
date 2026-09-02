import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Student, StudentSchema } from '../common/schemas/student.schema';
import {
  StudentPayment,
  StudentPaymentSchema,
} from '../common/schemas/student-payment.schema';
import {
  Attendance,
  AttendanceSchema,
} from '../common/schemas/attendance.schema';
import { Group, GroupSchema } from '../common/schemas/group.schema';
import { Piece, PieceSchema } from '../common/schemas/piece.schema';
import {
  Professor,
  ProfessorSchema,
} from '../common/schemas/professor.schema';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';
import {
  StudentRegularityEvent,
  StudentRegularityEventSchema,
} from '../common/schemas/student-regularity-event.schema';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Student.name, schema: StudentSchema },
      { name: StudentPayment.name, schema: StudentPaymentSchema },
      { name: Attendance.name, schema: AttendanceSchema },
      { name: Group.name, schema: GroupSchema },
      { name: Piece.name, schema: PieceSchema },
      { name: Professor.name, schema: ProfessorSchema },
      { name: StudentRegularityEvent.name, schema: StudentRegularityEventSchema },
    ]),
  ],
  controllers: [StudentsController],
  providers: [StudentsService, AllowedViewsGuard],
  exports: [StudentsService],
})
export class StudentsModule {}
