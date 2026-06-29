import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import {
  ReservationPaymentMethod,
  ReservationSource,
  ReservationStatus,
} from '../enums/reservation.enum';

export type ReservationDocument = Reservation & Document;

/**
 * Reserva de un cliente sobre un turno. Nace PENDING (hold con cupo descontado)
 * y se confirma cuando MercadoPago aprueba el pago (o directo, si la crea el
 * admin). El `code` de 6 caracteres (3 letras + 3 números, ej. "MIS482") es el
 * identificador público para gestionar (ver / cancelar) sin login.
 */
@Schema({
  timestamps: true,
  collection: 'reservations',
})
export class Reservation {
  // Código público de gestión: 3 letras + 3 números, mayúsculas, sin guion.
  // El front lo muestra como "MIS-482".
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'ExperienceSession',
    required: true,
  })
  sessionId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Experience', required: true })
  experienceId: Types.ObjectId;

  // Snapshots para mostrar la reserva sin depender del turno/plantilla.
  @Prop({ required: true, trim: true })
  experienceName: string;

  @Prop({ type: Date, required: true })
  startAt: Date;

  // Precio por persona al momento de reservar.
  @Prop({ required: true, min: 0 })
  unitPrice: number;

  @Prop({ required: true, min: 1 })
  quantity: number;

  // `amount` = lo que se COBRA en esta operación (la seña en reservas públicas;
  // lo que cobró el admin en reservas de admin). Es lo que va a MercadoPago y a
  // caja. Se mantiene por compatibilidad histórica.
  @Prop({ required: true, min: 0 })
  amount: number;

  // Total de la experiencia = unitPrice * quantity (el 100%).
  @Prop({ required: true, min: 0, default: 0 })
  totalAmount: number;

  // Seña cobrada al reservar (== amount en el flujo público).
  @Prop({ required: true, min: 0, default: 0 })
  depositAmount: number;

  // Saldo pendiente a abonar luego = totalAmount - depositAmount.
  @Prop({ required: true, min: 0, default: 0 })
  balanceDue: number;

  @Prop({
    required: true,
    enum: ReservationStatus,
    default: ReservationStatus.PENDING,
  })
  status: ReservationStatus;

  @Prop({
    required: true,
    enum: ReservationSource,
    default: ReservationSource.PUBLIC,
  })
  source: ReservationSource;

  @Prop({ required: true, enum: ReservationPaymentMethod })
  paymentMethod: ReservationPaymentMethod;

  // Datos del cliente (snapshot embebido). `clientId` opcional si se vincula a
  // un Client existente del sistema.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Client' })
  clientId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  customerName: string;

  @Prop({ lowercase: true, trim: true })
  customerEmail?: string;

  @Prop({ trim: true })
  customerPhone?: string;

  // Clave de idempotencia del hold público (UUID que manda el front). Evita que
  // un doble-click genere dos holds = doble consumo de cupo. Sparse: las reservas
  // de admin no la usan.
  @Prop({ trim: true })
  idempotencyKey?: string;

  // MercadoPago.
  @Prop({ trim: true })
  preferenceId?: string;

  // init_point de la preference (URL de redirect a Checkout Pro). Se persiste
  // para devolverlo en reintentos idempotentes del mismo hold.
  @Prop({ trim: true })
  mpInitPoint?: string;

  @Prop({ trim: true })
  mpExternalReference?: string;

  // Vencimiento del hold (sólo relevante mientras status === PENDING).
  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ type: Date })
  confirmedAt?: Date;

  @Prop({ type: Date })
  cancelledAt?: Date;

  // Si la cobró el admin e impactó caja, link al ingreso generado.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'CashIncome' })
  cashIncomeId?: Types.ObjectId;

  // Usuario admin que la creó (si source === ADMIN).
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  createdById?: Types.ObjectId;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const ReservationSchema = SchemaFactory.createForClass(Reservation);

// code ya tiene índice único por @Prop({ unique: true }).
ReservationSchema.index({ sessionId: 1 });
ReservationSchema.index({ experienceId: 1 });
ReservationSchema.index({ status: 1 });
ReservationSchema.index({ status: 1, expiresAt: 1 });
ReservationSchema.index({ preferenceId: 1 });
ReservationSchema.index({ mpExternalReference: 1 });
// idempotencyKey único pero opcional: índice sparse para no chocar entre las
// reservas que no la traen (admin).
ReservationSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
ReservationSchema.index({ customerEmail: 1 });
ReservationSchema.index({ createdAt: -1 });
