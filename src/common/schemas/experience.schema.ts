import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ExperienceDocument = Experience & Document;

/**
 * Plantilla de experiencia (taller de torno, cumpleaños, buffet+cerámica, etc.).
 * NO tiene fecha: es la definición reutilizable. Los turnos concretos (con fecha,
 * hora y cupo) viven en `ExperienceSession` y copian estos valores al crearse,
 * de modo que editar la plantilla no altera turnos ya publicados.
 */
@Schema({
  timestamps: true,
  collection: 'experiences',
})
export class Experience {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  // Duración en minutos (para mostrar y calcular el fin del turno).
  @Prop({ required: true, min: 1 })
  durationMinutes: number;

  // Precio por persona (ARS). Un turno puede sobreescribirlo.
  @Prop({ required: true, min: 0 })
  basePrice: number;

  // Cupo por defecto al generar turnos. Cada turno guarda su propio `capacity`.
  @Prop({ required: true, min: 1 })
  defaultCapacity: number;

  // Porcentaje de SEÑA que se cobra al reservar (el resto es saldo pendiente).
  // En Mística toda reserva es con seña del 50%. 100 = se cobra el total.
  @Prop({ required: true, min: 0, max: 100, default: 50 })
  depositPct: number;

  // Color hex (#RRGGBB) para identificar la experiencia en la agenda.
  // Obligatorio; docs viejos se backfillean con scripts/backfill-experience-colors.js.
  @Prop({ required: true, trim: true, default: '#9d684e' })
  color: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  // ¿Se reserva online por acá (genera turnos + seña)? Si es false, es un
  // servicio que se COORDINA: el bot/web solo informa y capta la consulta
  // (mensuales, eventos, escuelita, facilitadores, tienda). Default true.
  @Prop({ type: Boolean, default: true })
  bookableOnline: boolean;

  // Lugares FIJOS del salón que ocupa un turno abierto de esta experiencia,
  // independiente de los anotados (ej. la mesa grande del taller = 10: no se
  // puede mover, resta capacidad aunque haya menos inscriptos). 0 = ninguno,
  // el control del salón usa los anotados (seatsTaken).
  @Prop({ required: true, min: 0, default: 0 })
  venueSeats: number;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const ExperienceSchema = SchemaFactory.createForClass(Experience);

ExperienceSchema.index({ isActive: 1 });
ExperienceSchema.index({ deletedAt: 1 });
ExperienceSchema.index({ name: 1 });
