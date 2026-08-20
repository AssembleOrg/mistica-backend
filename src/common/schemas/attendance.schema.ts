import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type AttendanceDocument = Attendance & Document;

/**
 * Registro de un alumno en una clase puntual. MAKEUP = vino a recuperar una
 * clase (puede ser un alumno de otro grupo).
 */
@Schema({ _id: false })
export class AttendanceRecord {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['PRESENT', 'ABSENT', 'MAKEUP'],
    default: 'PRESENT',
  })
  status: 'PRESENT' | 'ABSENT' | 'MAKEUP';

  @Prop({ trim: true })
  notes?: string;
}

export const AttendanceRecordSchema =
  SchemaFactory.createForClass(AttendanceRecord);

/**
 * Asistencia de UNA clase de un grupo (un documento por grupo y fecha).
 * La toma el profesor; el historial de regularidad del alumno se arma
 * consultando sus records en el tiempo.
 */
@Schema({ timestamps: true, collection: 'attendance' })
export class Attendance {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Group', required: true })
  groupId: Types.ObjectId;

  // Día de la clase, 'YYYY-MM-DD'.
  @Prop({ required: true, trim: true })
  dateKey: string;

  @Prop({ type: [AttendanceRecordSchema], default: [] })
  records: AttendanceRecord[];

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  takenById?: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const AttendanceSchema = SchemaFactory.createForClass(Attendance);

// Una sola toma de asistencia por grupo y día (se edita, no se duplica).
AttendanceSchema.index({ groupId: 1, dateKey: 1 }, { unique: true });
AttendanceSchema.index({ 'records.studentId': 1 });
