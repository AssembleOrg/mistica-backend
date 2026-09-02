import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type StudentDocument = Student & Document;

/**
 * Alumno del taller (taller mensual, escuelita, clases). Su seguimiento se
 * divide en DOS áreas independientes:
 * · ADMINISTRATIVO (perfil Administrativo): datos, incorporación, pagos,
 *   vencimientos, regularidad, notas administrativas.
 * · PRÁCTICO (perfil Profesor): grupo en el que cursa, asistencia, piezas en
 *   confección y terminadas, fotos, notas de práctica.
 * Los pagos viven en StudentPayment; la asistencia en Attendance; las piezas
 * se vinculan por Piece.studentId.
 */
@Schema({ timestamps: true, collection: 'students' })
export class Student {
  @Prop({ required: true, trim: true })
  name: string;

  /** Cliente existente asociado: evita duplicar la ficha de contacto. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Client' })
  clientId?: Types.ObjectId;

  @Prop({ trim: true })
  clientName?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ lowercase: true, trim: true })
  email?: string;

  // Para la escuelita (niños): adulto responsable y su contacto.
  @Prop({ trim: true })
  guardianName?: string;

  @Prop({ type: Date })
  birthDate?: Date;

  // Fecha de incorporación al taller.
  @Prop({ type: Date, default: Date.now })
  joinedAt: Date;

  // Notas ADMINISTRATIVAS (situaciones que requieren seguimiento, acuerdos de
  // pago, etc.). Las ve el perfil administrativo.
  @Prop({ trim: true })
  adminNotes?: string;

  // Notas PRÁCTICAS (técnica, avances, materiales). Las ve el profesor.
  @Prop({ trim: true })
  practicalNotes?: string;

  // true mientras cursa; false = dio de baja (se conserva el historial).
  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const StudentSchema = SchemaFactory.createForClass(Student);

StudentSchema.index({ deletedAt: 1, isActive: 1 });
StudentSchema.index({ name: 1 });
StudentSchema.index({ clientId: 1 });
