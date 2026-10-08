import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type ExtraClassDocument = ExtraClass & Document;

/**
 * Clase extra: un alumno suma una clase en otro grupo además de la suya (p. ej.
 * un doble turno). No recupera nada: aparece en la lista de esa clase para que
 * la profe lo tenga, y su asistencia se toma como la de cualquiera.
 */
@Schema({ timestamps: true, collection: 'extra_classes' })
export class ExtraClass {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Group', required: true })
  groupId: Types.ObjectId;

  /** Día de la clase ('YYYY-MM-DD'). */
  @Prop({ required: true, trim: true })
  date: string;

  @Prop({ trim: true })
  notes?: string;

  /** Quién la sumó (en las cuentas compartidas, la persona elegida). */
  @Prop({ trim: true })
  createdByName?: string;
}

export const ExtraClassSchema = SchemaFactory.createForClass(ExtraClass);

// Una sola vez por alumno y clase.
ExtraClassSchema.index({ studentId: 1, groupId: 1, date: 1 }, { unique: true });
ExtraClassSchema.index({ groupId: 1, date: 1 });
