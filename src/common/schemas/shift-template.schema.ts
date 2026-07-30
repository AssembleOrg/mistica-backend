import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type ShiftTemplateDocument = ShiftTemplate & Document;

/**
 * Turno fijo del día, editable desde el panel.
 *
 * El día está partido en bloques cerrados (ej. Turno 1 de 15:00 a 17:30 y Turno
 * 2 de 17:50 a 20:00) y el hueco entre uno y otro es el tiempo de limpieza. Los
 * turnos NO son por experiencia: existen solos y en un mismo turno conviven
 * reservas de experiencias distintas. Lo que se comparte es el salón — las
 * mesas — no la actividad.
 *
 * Gracias a esto el equipo no carga turnos a mano: define estas plantillas una
 * vez y el turno concreto (ExperienceSession) se crea solo la primera vez que
 * alguien reserva en ese día + bloque + experiencia.
 */
@Schema({ timestamps: true, collection: 'shift_templates' })
export class ShiftTemplate {
  // Clave corta y estable ('T1'). Se persiste en cada reserva.
  @Prop({ required: true, trim: true, uppercase: true })
  key: string;

  @Prop({ required: true, trim: true })
  name: string;

  // Hora local de inicio y fin, 'HH:mm' (zona del negocio).
  @Prop({ required: true, trim: true })
  start: string;

  @Prop({ required: true, trim: true })
  end: string;

  /**
   * Día ISO (1=lunes … 7=domingo) al que aplica. Vacío = todos los días. Si un
   * día tiene plantillas propias, esas mandan sobre las genéricas: así se
   * cambian los horarios de un día puntual sin duplicar el resto.
   */
  @Prop({ min: 1, max: 7 })
  weekday?: number;

  /**
   * Experiencias reservables en este turno. Vacío = todas las que se reservan
   * online (el caso normal). Sirve para acotar un bloque a una experiencia
   * concreta sin tocar código.
   */
  @Prop({ type: [SchemaTypes.ObjectId], ref: 'Experience', default: [] })
  experienceIds: Types.ObjectId[];

  // Orden de aparición en la agenda y en la landing.
  @Prop({ required: true, min: 0, default: 0 })
  order: number;

  @Prop({ type: Boolean, default: true })
  active: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const ShiftTemplateSchema = SchemaFactory.createForClass(ShiftTemplate);

// Una sola plantilla por (clave, día). weekday ausente = la genérica.
ShiftTemplateSchema.index({ key: 1, weekday: 1 }, { unique: true });
ShiftTemplateSchema.index({ active: 1, order: 1 });
