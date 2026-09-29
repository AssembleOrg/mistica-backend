import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PieceTypeDocument = PieceType & Document;

/** Catálogo de piezas para elegir al registrar una ficha (taza, bowl, plato…). */
@Schema({ timestamps: true, collection: 'piece_types' })
export class PieceType {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const PieceTypeSchema = SchemaFactory.createForClass(PieceType);
PieceTypeSchema.index({ deletedAt: 1, name: 1 });
