import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type CashSessionDocument = CashSession & Document;

export type CashSessionStatus = 'OPEN' | 'CLOSED';

/**
 * Sesión de caja (apertura/cierre).
 *
 * Una caja siempre arranca con un monto inicial en efectivo (`openingCash`).
 * Al cerrarla se registra el `countedClosingCash` que el cajero conta
 * físicamente. El backend calcula `expectedClosingCash` sumando todas las
 * ventas en CASH y restando todos los egresos en CASH del período abierto;
 * la diferencia (`discrepancy`) puede ser positiva (sobra plata) o negativa
 * (falta plata), pero NO bloquea el cierre.
 *
 * En el sistema sólo puede haber UNA sesión OPEN a la vez. Las ventas se
 * bloquean si no hay sesión abierta.
 */
@Schema({
  timestamps: true,
  collection: 'cash_sessions',
})
export class CashSession {
  @Prop({ required: true, enum: ['OPEN', 'CLOSED'], default: 'OPEN' })
  status: CashSessionStatus;

  @Prop({ type: Date, required: true, default: Date.now })
  openedAt: Date;

  @Prop({ type: Date })
  closedAt?: Date;

  @Prop({ required: true, min: 0 })
  openingCash: number;

  /** Sólo presente al cerrar. Lo declara el cajero al hacer el conteo físico. */
  @Prop({ min: 0 })
  countedClosingCash?: number;

  /**
   * Sólo presente al cerrar. Calculado por el backend:
   *   openingCash + ventas en CASH (amount) - egresos en CASH (amount) - vueltos en CASH (changeGiven)
   * Las prepaid en CASH también suman acá.
   */
  @Prop({ min: 0 })
  expectedClosingCash?: number;

  /**
   * Sólo presente al cerrar.
   * = countedClosingCash - expectedClosingCash
   * Negativo => falta plata. Positivo => sobra plata.
   */
  @Prop()
  discrepancy?: number;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  openedByUserId?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  closedByUserId?: Types.ObjectId;

  @Prop({ trim: true })
  openingNotes?: string;

  @Prop({ trim: true })
  closingNotes?: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const CashSessionSchema = SchemaFactory.createForClass(CashSession);

CashSessionSchema.index({ status: 1 });
CashSessionSchema.index({ openedAt: -1 });
CashSessionSchema.index({ closedAt: -1 });

// Garantía de "una sola sesión OPEN a la vez": índice único parcial.
// Si llegara a haber concurrencia, MongoDB rechaza la segunda inserción.
CashSessionSchema.index(
  { status: 1 },
  { unique: true, partialFilterExpression: { status: 'OPEN' } },
);
