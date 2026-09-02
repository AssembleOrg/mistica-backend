import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type StudentRegularityEventDocument = StudentRegularityEvent & Document;

/** Cambio verificable de la situación de cuota del alumno. */
@Schema({ timestamps: true, collection: 'student_regularity_events' })
export class StudentRegularityEvent {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true, enum: ['UP_TO_DATE', 'OVERDUE'] })
  status: 'UP_TO_DATE' | 'OVERDUE';

  @Prop({ required: true, min: 0, default: 0 })
  overdueCount: number;

  @Prop({ required: true, min: 0, default: 0 })
  overdueAmount: number;

  @Prop({ required: true, trim: true })
  source: 'PAYMENT_CREATED' | 'PAYMENT_UPDATED' | 'PAYMENT_REMOVED' | 'DAILY_CHECK';
}

export const StudentRegularityEventSchema =
  SchemaFactory.createForClass(StudentRegularityEvent);

StudentRegularityEventSchema.index({ studentId: 1, createdAt: -1 });
