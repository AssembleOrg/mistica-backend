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

  @Prop({ type: [String], default: [] })
  images: string[];

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
