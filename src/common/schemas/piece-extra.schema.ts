import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PieceExtraDocument = PieceExtra & Document;

/**
 * Catálogo de adicionales de pieza (Incluida, Estándar, Premium…). Elegido en
 * la ficha de una reserva, su monto se suma al total y al saldo de la reserva.
 */
@Schema({ timestamps: true, collection: 'piece_extras' })
export class PieceExtra {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const PieceExtraSchema = SchemaFactory.createForClass(PieceExtra);
PieceExtraSchema.index({ deletedAt: 1, name: 1 });
