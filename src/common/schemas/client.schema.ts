import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClientDocument = Client & Document;

@Schema({ 
  timestamps: true,
  collection: 'clients'
})
export class Client {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ lowercase: true, trim: true })
  email?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ trim: true })
  cuit?: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const ClientSchema = SchemaFactory.createForClass(Client);

// Add indexes for better performance
ClientSchema.index({ fullName: 1 });
ClientSchema.index({ email: 1 });
ClientSchema.index({ phone: 1 });
ClientSchema.index({ cuit: 1 });
ClientSchema.index({ deletedAt: 1 });
