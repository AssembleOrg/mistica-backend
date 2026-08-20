import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type StaffTaskDocument = StaffTask & Document;

/**
 * Tarea interna del personal. Se crea, se asigna a un integrante del equipo
 * (cuenta del sistema) y se sigue hasta marcarla hecha.
 */
@Schema({ timestamps: true, collection: 'staff_tasks' })
export class StaffTask {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  description?: string;

  // Integrante asignado (cuenta del sistema) + snapshot del nombre.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  assigneeUserId?: Types.ObjectId;

  @Prop({ trim: true })
  assigneeName?: string;

  @Prop({ required: true, enum: ['PENDING', 'DONE'], default: 'PENDING' })
  status: 'PENDING' | 'DONE';

  @Prop({ type: Date })
  dueDate?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  createdById?: Types.ObjectId;

  @Prop({ type: Date })
  deletedAt?: Date;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const StaffTaskSchema = SchemaFactory.createForClass(StaffTask);

StaffTaskSchema.index({ deletedAt: 1, status: 1 });
StaffTaskSchema.index({ assigneeUserId: 1, status: 1 });
