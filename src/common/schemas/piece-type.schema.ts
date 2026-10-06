import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type PieceTypeDocument = PieceType & Document;

/** Catálogo de piezas para elegir al registrar una ficha (taza, bowl, plato…). */
@Schema({ timestamps: true, collection: 'piece_types' })
export class PieceType {
  @Prop({ required: true, trim: true })
  name: string;

  // Categoría (adicional del catálogo: Incluida, Especial, Premium, 2x1…).
  // Al elegir la pieza se propone su adicional, en las fichas de reservas y
  // en la pieza del mes de los alumnos.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'PieceExtra' })
  extraId?: Types.ObjectId;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const PieceTypeSchema = SchemaFactory.createForClass(PieceType);
PieceTypeSchema.index({ deletedAt: 1, name: 1 });
