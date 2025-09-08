import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PaymentMethod, SaleStatus } from '../enums';

export type SaleDocument = Sale & Document;

@Schema({ 
  timestamps: true,
  collection: 'sales'
})
export class Sale {
  @Prop({ required: true, unique: true, trim: true })
  saleNumber: string;

  @Prop({ type: Types.ObjectId, ref: 'Client' })
  clientId?: Types.ObjectId;

  @Prop({ trim: true })
  customerName?: string;

  @Prop({ lowercase: true, trim: true })
  customerEmail?: string;

  @Prop({ trim: true })
  customerPhone?: string;

  @Prop({ 
    type: [{
      productId: { type: Types.ObjectId, ref: 'Product', required: true },
      productName: { type: String, required: true, trim: true },
      quantity: { type: Number, required: true, min: 1 },
      unitPrice: { type: Number, required: true, min: 0 },
      subtotal: { type: Number, required: true, min: 0 }
    }],
    required: true,
    validate: {
      validator: function(items: any[]) {
        return items && items.length > 0;
      },
      message: 'La venta debe tener al menos un producto'
    }
  })
  items: Array<{
    productId: Types.ObjectId;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;

  @Prop({ required: true, min: 0 })
  subtotal: number;

  @Prop({ min: 0, max: 100, default: 0 })
  tax: number; // Porcentaje de impuesto (0-100)

  @Prop({ min: 0, max: 100, default: 0 })
  discount: number; // Porcentaje de descuento (0-100)

  @Prop({ min: 0, default: 0 })
  prepaidUsed: number; // Monto en dinero usado de prepaid

  @Prop({ type: Types.ObjectId, ref: 'Prepaid' })
  prepaidId?: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  total: number;

  @Prop({ required: true, enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Prop({ required: true, enum: SaleStatus, default: SaleStatus.PENDING })
  status: SaleStatus;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const SaleSchema = SchemaFactory.createForClass(Sale);

// Add indexes for better performance
SaleSchema.index({ saleNumber: 1 });
SaleSchema.index({ customerEmail: 1 });
SaleSchema.index({ status: 1 });
SaleSchema.index({ paymentMethod: 1 });
SaleSchema.index({ createdAt: -1 });
SaleSchema.index({ deletedAt: 1 });
SaleSchema.index({ 'items.productId': 1 });
