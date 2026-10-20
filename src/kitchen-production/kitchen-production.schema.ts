import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type KitchenProductionDocument = KitchenProduction & Document;

/**
 * Producción de cocina: lo que cocina va preparando (tortas, cookies, el
 * buffet, lo que sea) con su cantidad. Por día y, si corresponde, ligado a
 * una reserva. Sólo es registro: no mueve stock.
 */
@Schema({ timestamps: true, collection: 'kitchen_production' })
export class KitchenProduction {
  /** Día de la producción (YYYY-MM-DD, hora de Argentina). */
  @Prop({ required: true, trim: true })
  day: string;

  @Prop({ required: true, trim: true })
  item: string;

  @Prop({ required: true, min: 0 })
  quantity: number;

  /** Unidades, kg, porciones, bandejas… (texto libre). */
  @Prop({ trim: true })
  unit?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Reservation' })
  reservationId?: Types.ObjectId;

  /** Copia para mostrar sin buscar la reserva: "Stefanie · 15:30". */
  @Prop({ trim: true })
  reservationLabel?: string;

  @Prop({ trim: true })
  note?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  /** Quién (la persona, en las cuentas compartidas). */
  @Prop({ trim: true })
  byName?: string;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const KitchenProductionSchema = SchemaFactory.createForClass(KitchenProduction);
KitchenProductionSchema.index({ day: -1, createdAt: 1 });
KitchenProductionSchema.index({ reservationId: 1 });
