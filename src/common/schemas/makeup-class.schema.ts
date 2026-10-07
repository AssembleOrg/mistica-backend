import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type MakeupClassDocument = MakeupClass & Document;

/**
 * Recuperación agendada: un alumno que falta (o avisó que va a faltar) a una
 * clase de su grupo la recupera otro día, en OTRO grupo. Se ve en las dos
 * asistencias: en la clase original ("recupera el vie 9/10") y en la de
 * destino, donde aparece sumado como alumno que recupera. Que efectivamente
 * vino lo dice la asistencia de destino (MAKEUP → la original queda
 * "recuperada", ver Attendance.records.recoveredIn*).
 */
@Schema({ timestamps: true, collection: 'makeup_classes' })
export class MakeupClass {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  /** Clase que falta: su grupo y su día ('YYYY-MM-DD'). */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Group', required: true })
  fromGroupId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  fromDate: string;

  /** Clase en la que la recupera. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Group', required: true })
  toGroupId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  toDate: string;

  @Prop({ trim: true })
  notes?: string;

  /** Quién la agendó (en las cuentas compartidas, la persona elegida). */
  @Prop({ trim: true })
  createdByName?: string;
}

export const MakeupClassSchema = SchemaFactory.createForClass(MakeupClass);

// Una clase se recupera una sola vez.
MakeupClassSchema.index(
  { studentId: 1, fromGroupId: 1, fromDate: 1 },
  { unique: true },
);
MakeupClassSchema.index({ toGroupId: 1, toDate: 1 });
MakeupClassSchema.index({ fromGroupId: 1, fromDate: 1 });
