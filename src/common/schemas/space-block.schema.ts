import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SpaceBlockDocument = SpaceBlock & Document;

/**
 * Bloqueo de lugares del salón en una franja horaria: un taller regular
 * (recurrente por día de semana) o un evento/cumpleaños puntual (una fecha) que
 * ocupa parte de la capacidad del local y por lo tanto resta lugares para las
 * reservas que se solapan en ese horario. NO es un turno reservable: sólo ocupa
 * espacio. Los horarios se interpretan en hora de Argentina.
 */
@Schema({ timestamps: true, collection: 'space_blocks' })
export class SpaceBlock {
  // 'WEEKLY' (recurrente, usa weekday) | 'ONE_OFF' (puntual, usa date).
  @Prop({ required: true, enum: ['WEEKLY', 'ONE_OFF'] })
  kind: 'WEEKLY' | 'ONE_OFF';

  // Día de la semana ISO 1=lunes .. 7=domingo (para WEEKLY).
  @Prop({ min: 1, max: 7 })
  weekday?: number;

  // Fecha puntual 'YYYY-MM-DD' en hora AR (para ONE_OFF).
  @Prop({ trim: true })
  date?: string;

  // Franja horaria local 'HH:mm'.
  @Prop({ required: true, trim: true })
  start: string;

  @Prop({ required: true, trim: true })
  end: string;

  // Cuántos lugares del salón ocupa (ej. una mesa grande = 10).
  @Prop({ required: true, min: 1 })
  seats: number;

  @Prop({ trim: true })
  label?: string;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const SpaceBlockSchema = SchemaFactory.createForClass(SpaceBlock);

SpaceBlockSchema.index({ kind: 1 });
SpaceBlockSchema.index({ deletedAt: 1 });
