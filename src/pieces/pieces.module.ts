import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PiecesController } from './pieces.controller';
import { PiecesService } from './pieces.service';
import { Piece, PieceSchema } from '../common/schemas/piece.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Piece.name, schema: PieceSchema }]),
  ],
  controllers: [PiecesController],
  providers: [PiecesService],
  exports: [PiecesService],
})
export class PiecesModule {}
