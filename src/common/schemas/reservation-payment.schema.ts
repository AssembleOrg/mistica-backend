import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type ReservationPaymentDocument = ReservationPayment & Document;

/**
 * Registro de un pago de MercadoPago asociado a una reserva. El índice único
 * sobre `mpPaymentId` es la pieza de IDEMPOTENCIA del webhook: MercadoPago
 * reintenta notificaciones, así que el primer insert gana y los reintentos
 * chocan con duplicate-key (E11000) y se descartan.
 */
@Schema({
  timestamps: true,
  collection: 'reservation_payments',
})
export class ReservationPayment {
  // ID del pago en MercadoPago (no la preference). Único.
  @Prop({ required: true, unique: true, trim: true })
  mpPaymentId: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Reservation' })
  reservationId?: Types.ObjectId;

  @Prop({ trim: true })
  preferenceId?: string;

  @Prop({ trim: true })
  externalReference?: string;

  @Prop({ min: 0 })
  amount?: number;

  // Estado tal cual lo reporta MercadoPago: approved | rejected | cancelled | ...
  @Prop({ trim: true })
  status?: string;

  // Respuesta cruda del pago para auditoría/debug.
  @Prop({ type: SchemaTypes.Mixed })
  rawResponse?: Record<string, unknown>;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const ReservationPaymentSchema =
  SchemaFactory.createForClass(ReservationPayment);

// mpPaymentId ya tiene índice único por @Prop({ unique: true }).
ReservationPaymentSchema.index({ reservationId: 1 });
ReservationPaymentSchema.index({ preferenceId: 1 });
