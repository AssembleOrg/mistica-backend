import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PiecesController } from './pieces.controller';
import { PiecesService } from './pieces.service';
import { Piece, PieceSchema } from '../common/schemas/piece.schema';
import {
  Reservation,
  ReservationSchema,
} from '../common/schemas/reservation.schema';
import { ProfessorsModule } from '../professors/professors.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Piece.name, schema: PieceSchema },
      { name: Reservation.name, schema: ReservationSchema },
    ]),
    ProfessorsModule,
  ],
  controllers: [PiecesController],
  providers: [PiecesService],
  exports: [PiecesService],
})
export class PiecesModule {}
