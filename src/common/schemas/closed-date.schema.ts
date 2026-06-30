import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { ClosedDateKind } from '../enums/closed-date.enum';

export type ClosedDateDocument = ClosedDate & Document;

/**
 * Día/regla en que el local NO abre. Fuente de verdad para:
 *  - bloquear la generación de turnos y las reservas en esas fechas, y
 *  - que el bot avise "ese día no abrimos".
 *
 * Dos tipos (campo `kind`):
 *  - DATE:   rango concreto [from, to] (un día suelto = from y to el mismo día).
 *            Se comparan por DÍA en la zona horaria del negocio.
 *  - WEEKLY: día de semana recurrente. `weekday` en formato ISO de Luxon
 *            (1 = lunes … 7 = domingo).
 */
@Schema({ timestamps: true, collection: 'closed_dates' })
export class ClosedDate {
  @Prop({ required: true, enum: ClosedDateKind })
  kind: ClosedDateKind;

  // kind = DATE
  @Prop({ type: Date })
  from?: Date;

  @Prop({ type: Date })
  to?: Date;

  // kind = WEEKLY (1 = lunes … 7 = domingo, ISO Luxon)
  @Prop({ type: Number, min: 1, max: 7 })
  weekday?: number;

  // Motivo opcional, visible para el admin y mencionable por el bot ("Feriado").
  @Prop({ trim: true, maxlength: 120 })
  reason?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const ClosedDateSchema = SchemaFactory.createForClass(ClosedDate);

ClosedDateSchema.index({ kind: 1 });
ClosedDateSchema.index({ from: 1, to: 1 });
ClosedDateSchema.index({ weekday: 1 });
ClosedDateSchema.index({ deletedAt: 1 });
