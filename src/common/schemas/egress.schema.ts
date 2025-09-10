import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Currency, EgressType, EgressStatus } from '../enums';

export type EgressDocument = Egress & Document;

@Schema({ 
  timestamps: true,
  collection: 'egresses'
})
export class Egress {
  @Prop({ required: true, unique: true, trim: true })
  egressNumber: string;

  @Prop({ required: true, trim: true })
  concept: string; // Concepto/Explicación del egreso

  @Prop({ required: true, min: 0 })
  amount: number; // Monto

  @Prop({ required: true, enum: Currency, default: Currency.USD })
  currency: Currency;

  @Prop({ required: true, enum: EgressType })
  type: EgressType;

  @Prop({ required: true, enum: EgressStatus, default: EgressStatus.PENDING })
  status: EgressStatus;

  @Prop({ trim: true })
  notes?: string; // Notas adicionales

  @Prop({ trim: true })
  authorizedBy?: string; // Persona que autoriza el egreso

  @Prop({ type: Types.ObjectId, ref: 'User' })
  userId?: Types.ObjectId; // Usuario que registra el egreso

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const EgressSchema = SchemaFactory.createForClass(Egress);

// Add indexes for better performance
EgressSchema.index({ egressNumber: 1 });
EgressSchema.index({ concept: 'text' });
EgressSchema.index({ status: 1 });
EgressSchema.index({ type: 1 });
EgressSchema.index({ currency: 1 });
EgressSchema.index({ createdAt: -1 });
EgressSchema.index({ deletedAt: 1 });
EgressSchema.index({ userId: 1 });