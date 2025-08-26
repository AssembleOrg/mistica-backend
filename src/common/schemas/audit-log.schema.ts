import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AuditLogDocument = AuditLog & Document;

@Schema({ 
  timestamps: false,
  collection: 'audit_logs'
})
export class AuditLog {
  @Prop({ required: true, trim: true })
  entity: string;

  @Prop({ required: true, trim: true })
  entityId: string;

  @Prop({ required: true, trim: true })
  action: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ trim: true })
  userEmail?: string;

  @Prop({ required: true, trim: true })
  ipAddress: string;

  @Prop({ type: Object })
  oldValues?: Record<string, any>;

  @Prop({ type: Object })
  newValues?: Record<string, any>;

  @Prop({ type: Date, default: Date.now })
  timestamp: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Add indexes for better performance
AuditLogSchema.index({ entity: 1, entityId: 1 });
AuditLogSchema.index({ userId: 1 });
AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ userEmail: 1 });
