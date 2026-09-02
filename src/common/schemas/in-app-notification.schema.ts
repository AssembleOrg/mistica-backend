import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type InAppNotificationDocument = InAppNotification & Document;

/** Aviso persistente que aparece en el panel administrativo y se emite por SSE. */
@Schema({ timestamps: true, collection: 'in_app_notifications' })
export class InAppNotification {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  body: string;

  @Prop({ required: true, enum: ['PAYMENT_DUE', 'TASK_DUE', 'INFO'] })
  type: 'PAYMENT_DUE' | 'TASK_DUE' | 'INFO';

  /** Destinatarios explícitos. Vacío = aviso por rol (administración por defecto). */
  @Prop({ type: [SchemaTypes.ObjectId], ref: 'User', default: [] })
  targetUserIds: Types.ObjectId[];

  @Prop({ type: [String], enum: ['admin', 'user'], default: ['admin'] })
  visibleToRoles: string[];

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'User', default: [] })
  readByUserIds: Types.ObjectId[];

  @Prop({ type: Date })
  expiresAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const InAppNotificationSchema = SchemaFactory.createForClass(InAppNotification);
InAppNotificationSchema.index({ createdAt: -1 });
