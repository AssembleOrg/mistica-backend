import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PiecesController } from './pieces.controller';
import { PiecesService } from './pieces.service';
import { PieceTypesService } from './piece-types.service';
import { PieceExtrasService } from './piece-extras.service';
import { ReservationsModule } from '../reservations/reservations.module';
import { Piece, PieceSchema } from '../common/schemas/piece.schema';
import {
  PieceType,
  PieceTypeSchema,
} from '../common/schemas/piece-type.schema';
import {
  PieceExtra,
  PieceExtraSchema,
} from '../common/schemas/piece-extra.schema';
import {
  Reservation,
  ReservationSchema,
} from '../common/schemas/reservation.schema';
import { Student, StudentSchema } from '../common/schemas/student.schema';
import { Group, GroupSchema } from '../common/schemas/group.schema';
import { User, UserSchema } from '../common/schemas/user.schema';
import {
  AppSetting,
  AppSettingSchema,
} from '../common/schemas/app-setting.schema';
import { ProfessorsModule } from '../professors/professors.module';
import { AllowedViewsGuard } from '../common/guards/allowed-views.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Piece.name, schema: PieceSchema },
      { name: PieceType.name, schema: PieceTypeSchema },
      { name: PieceExtra.name, schema: PieceExtraSchema },
      { name: Reservation.name, schema: ReservationSchema },
      { name: Student.name, schema: StudentSchema },
      { name: Group.name, schema: GroupSchema },
      { name: User.name, schema: UserSchema },
      { name: AppSetting.name, schema: AppSettingSchema },
    ]),
    ProfessorsModule,
    ReservationsModule,
  ],
  controllers: [PiecesController],
  providers: [
    PiecesService,
    PieceTypesService,
    PieceExtrasService,
    AllowedViewsGuard,
  ],
  exports: [PiecesService],
})
export class PiecesModule {}
