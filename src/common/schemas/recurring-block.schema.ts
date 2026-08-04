import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RecurringBlockDocument = RecurringBlock & Document;

/**
 * Bloqueo FIJO semanal de mesas: un motivo o una experiencia (taller, colonia,
 * evento) que ocupa ciertas mesas todas las semanas en un día y rango horario.
 *
 * No se materializa en `day_occupancy`: se inyecta como ocupación VIRTUAL al
 * calcular disponibilidad y agenda. Así, editar la regla impacta todos los
 * días futuros sin migrar nada, y la disponibilidad máxima del día baja sola.
 */
@Schema({ timestamps: true, collection: 'recurring_blocks' })
export class RecurringBlock {
  // Motivo o experiencia que ocupa las mesas ('Taller de cerámica').
  @Prop({ required: true, trim: true })
  label: string;

  // Día ISO de la semana (1=lunes … 7=domingo).
  @Prop({ required: true, min: 1, max: 7 })
  weekday: number;

  // Rango horario local del bloqueo, 'HH:mm'.
  @Prop({ required: true, trim: true })
  start: string;

  @Prop({ required: true, trim: true })
  end: string;

  // Mesas que ocupa ('G1', 'M3'). Deben existir en el catálogo.
  @Prop({ type: [String], required: true })
  tableCodes: string[];

  @Prop({ default: true })
  active: boolean;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const RecurringBlockSchema =
  SchemaFactory.createForClass(RecurringBlock);

RecurringBlockSchema.index({ weekday: 1, active: 1 });
