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

  // 2x1: se eligen DOS piezas de esta categoría y van en una sola ficha (una
  // paleta de colores), con el adicional cobrado una vez.
  @Prop({ type: Boolean })
  pair?: boolean;

  // `amount` es el upgrade sobre la pieza incluida en la entrada (estándar
  // $0, especial +4.000…). Esto es lo que se cobra si la pieza se SUMA
  // además de la incluida (estándar +7.000, especial +11.000…). Sin valor,
  // se cobra `amount`.
  @Prop({ min: 0 })
  addAmount?: number;

  // Material que no es cerámica (Tela, Bastidor, Fibrofácil, Yeso, 3D): se
  // lo llevan en el día, así que la ficha no pide firma ni colores. Se carga
  // para el seguimiento del retiro y para cobrar el adicional si lo tiene.
  @Prop({ trim: true })
  material?: string;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const PieceExtraSchema = SchemaFactory.createForClass(PieceExtra);
PieceExtraSchema.index({ deletedAt: 1, name: 1 });
