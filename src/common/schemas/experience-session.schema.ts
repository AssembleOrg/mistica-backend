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
