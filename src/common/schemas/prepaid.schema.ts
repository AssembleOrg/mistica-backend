import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { PaymentMethod, PrepaidStatus } from '../enums';

export type PrepaidDocument = Prepaid & Document;

@Schema({
  timestamps: true,
  collection: 'prepaids',
})
export class Prepaid {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Client', required: true })
  clientId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  // Cómo se cobró la seña — para que la reportería de caja la sume al método
  // correspondiente. Si llega cash, se acepta también `receivedAmount` y
  // `changeGiven` para reflejar el vuelto entregado.
  @Prop({ required: true, enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Prop({ min: 0 })
  receivedAmount?: number;

  @Prop({ min: 0 })
  changeGiven?: number;

  @Prop({ required: true, enum: PrepaidStatus, default: PrepaidStatus.PENDING })
  status: PrepaidStatus;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ type: Date })
  consumedAt?: Date;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const PrepaidSchema = SchemaFactory.createForClass(Prepaid);

// Add indexes for better performance
PrepaidSchema.index({ clientId: 1 });
PrepaidSchema.index({ status: 1 });
PrepaidSchema.index({ paymentMethod: 1 });
PrepaidSchema.index({ createdAt: -1 });
PrepaidSchema.index({ deletedAt: 1 });
