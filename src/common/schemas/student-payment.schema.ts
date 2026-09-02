import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type StudentPaymentDocument = StudentPayment & Document;

/**
 * Pago (o cuota a pagar) de un alumno. El historial de pagos del alumno es la
 * lista de estos documentos; la REGULARIDAD se deriva: cuotas PENDING con
 * dueDate vencida = alumno atrasado. PAID registra fecha e importe abonado.
 */
@Schema({ timestamps: true, collection: 'student_payments' })
export class StudentPayment {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  // Concepto de la cuota ('Cuota agosto 2026', 'Clase suelta 12/08').
  @Prop({ required: true, trim: true })
  concept: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, enum: ['PAID', 'PENDING'], default: 'PENDING' })
  status: 'PAID' | 'PENDING';

  // Cuándo se abonó (sólo PAID).
  @Prop({ type: Date })
  paidAt?: Date;

  // Vencimiento (el taller cobra antes del día 10). PENDING + dueDate pasada
  // = vencida: aparece en las notificaciones administrativas.
  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ trim: true })
  method?: string; // efectivo / transferencia / etc. (texto libre)

  @Prop({ trim: true })
  notes?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  createdById?: Types.ObjectId;

  @Prop({ type: Date })
  deletedAt?: Date;

  // Recordatorios internos idempotentes (al equipo, no al alumno).
  @Prop({ type: Date })
  dueReminderSentAt?: Date;

  @Prop({ type: Date })
  overdueReminderSentAt?: Date;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const StudentPaymentSchema =
  SchemaFactory.createForClass(StudentPayment);

StudentPaymentSchema.index({ studentId: 1, createdAt: -1 });
StudentPaymentSchema.index({ status: 1, dueDate: 1 });
