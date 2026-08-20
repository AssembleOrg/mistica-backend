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
    ]),
  ],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
