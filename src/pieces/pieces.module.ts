import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PiecesController } from './pieces.controller';
import { PiecesService } from './pieces.service';
import { Piece, PieceSchema } from '../common/schemas/piece.schema';
import {
  Reservation,
  ReservationSchema,
} from '../common/schemas/reservation.schema';
import { Student, StudentSchema } from '../common/schemas/student.schema';
import {
  AppSetting,
  AppSettingSchema,
} from '../common/schemas/app-setting.schema';
import { ProfessorsModule } from '../professors/professors.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Piece.name, schema: PieceSchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: Student.name, schema: StudentSchema },
      { name: AppSetting.name, schema: AppSettingSchema },
    ]),
    ProfessorsModule,
  ],
  controllers: [PiecesController],
  providers: [PiecesService],
  exports: [PiecesService],
})
export class PiecesModule {}
