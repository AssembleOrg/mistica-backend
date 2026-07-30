import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { SessionStatus } from '../enums/reservation.enum';

export type ExperienceSessionDocument = ExperienceSession & Document;

/**
 * Turno concreto de una experiencia: una fecha/hora con cupo. Es el documento
 * sobre el que se hace el control de concurrencia de cupo.
 *
 * CONTROL DE CUPO (sin transacciones, mongod standalone):
 * el descuento de asientos se hace con un `findOneAndUpdate` atómico de ESTE
 * único documento, usando como guarda `capacity - seatsTaken >= qty` ($expr) y
 * un `$inc` sobre `seatsTaken`. MongoDB serializa las escrituras al mismo doc,
 * por lo que es imposible sobrevender. `seatsTaken` sólo se muta dentro de las
 * operaciones de reservar / liberar / cancelar. Disponibles = capacity - seatsTaken.
 */
@Schema({
  timestamps: true,
  collection: 'experience_sessions',
})
export class ExperienceSession {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Experience', required: true })
  experienceId: Types.ObjectId;

  // Snapshots tomados de la plantilla al crear el turno (auto-contenido).
  @Prop({ required: true, trim: true })
  experienceName: string;

  @Prop({ required: true, min: 1 })
  durationMinutes: number;

  // Precio efectivo por persona de ESTE turno (puede diferir de basePrice).
  @Prop({ required: true, min: 0 })
  price: number;

  // Seña (%) que se cobra al reservar este turno. Copiada de la plantilla al
  // crear; el resto queda como saldo pendiente. Default 50.
  @Prop({ required: true, min: 0, max: 100, default: 50 })
  depositPct: number;

  // Fecha de negocio 'YYYY-MM-DD' (hora AR) y clave del turno del día ('T1').
  // Juntas identifican el bloque: son la clave con la que el turno se crea solo
  // la primera vez que alguien reserva esa experiencia ese día en ese bloque.
  // Ausentes en los turnos viejos, cargados a mano antes del modelo de turnos.
  @Prop({ trim: true })
  dateKey?: string;

  @Prop({ trim: true })
  shiftKey?: string;

  // Inicio del turno (datetime, fuente de verdad). Calculado desde {fecha, hora}
  // en zona America/Argentina/Buenos_Aires al momento de crear.
  @Prop({ type: Date, required: true })
  startAt: Date;

  @Prop({ type: Date, required: true })
  endAt: Date;

  // Cupo máximo de personas del turno.
  @Prop({ required: true, min: 1 })
  capacity: number;

  // Asientos tomados (holds PENDING + reservas CONFIRMED). Disponibles =
  // capacity - seatsTaken. Mutado SOLO por reservar/liberar/cancelar.
  @Prop({ required: true, min: 0, default: 0 })
  seatsTaken: number;

  // Snapshot de Experience.venueSeats: lugares FIJOS del salón que ocupa este
  // turno abierto (ej. mesa de taller = 10), independiente de los anotados. El
  // control de capacidad del salón usa max(seatsTaken, venueSeats).
  @Prop({ required: true, min: 0, default: 0 })
  venueSeats: number;

  @Prop({ required: true, enum: SessionStatus, default: SessionStatus.DRAFT })
  status: SessionStatus;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const ExperienceSessionSchema =
  SchemaFactory.createForClass(ExperienceSession);

ExperienceSessionSchema.index({ experienceId: 1 });
ExperienceSessionSchema.index({ startAt: 1 });
ExperienceSessionSchema.index({ status: 1 });
ExperienceSessionSchema.index({ deletedAt: 1 });
ExperienceSessionSchema.index({ status: 1, startAt: 1 });
// Un único turno por (experiencia, día, bloque): es la guarda que hace que la
// creación automática sea idempotente aunque dos personas reserven a la vez.
// Parcial, porque los turnos viejos no tienen dateKey y colisionarían entre sí.
ExperienceSessionSchema.index(
  { experienceId: 1, dateKey: 1, shiftKey: 1 },
  { unique: true, partialFilterExpression: { dateKey: { $type: 'string' } } },
);
