import { PieceType, PieceTypeSchema } from '../common/schemas/piece-type.schema';
import { PieceExtra, PieceExtraSchema } from '../common/schemas/piece-extra.schema';
import { TrialClass, TrialClassSchema } from '../common/schemas/trial-class.schema';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Student, StudentSchema } from '../common/schemas/student.schema';
import { Client, ClientSchema } from '../common/schemas/client.schema';
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
import { Professor, ProfessorSchema } from '../common/schemas/professor.schema';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';
import {
  StudentRegularityEvent,
  StudentRegularityEventSchema,
} from '../common/schemas/student-regularity-event.schema';
import {
  StudentMonthlyPiece,
  StudentMonthlyPieceSchema,
} from '../common/schemas/student-monthly-piece.schema';
import { User, UserSchema } from '../common/schemas/user.schema';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Student.name, schema: StudentSchema },
      { name: Client.name, schema: ClientSchema },
      { name: StudentPayment.name, schema: StudentPaymentSchema },
      { name: Attendance.name, schema: AttendanceSchema },
      { name: Group.name, schema: GroupSchema },
      { name: User.name, schema: UserSchema },
      { name: Piece.name, schema: PieceSchema },
      { name: Professor.name, schema: ProfessorSchema },
      {
        name: StudentRegularityEvent.name,
        schema: StudentRegularityEventSchema,
      },
      { name: StudentMonthlyPiece.name, schema: StudentMonthlyPieceSchema },
      { name: PieceType.name, schema: PieceTypeSchema },
      { name: PieceExtra.name, schema: PieceExtraSchema },
      { name: TrialClass.name, schema: TrialClassSchema },
    ]),
  ],
  controllers: [StudentsController],
  providers: [StudentsService, AllowedViewsGuard],
  exports: [StudentsService],
})
export class StudentsModule {}
