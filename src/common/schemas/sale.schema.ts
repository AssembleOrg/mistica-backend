import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { PaymentMethod, SaleStatus } from '../enums';

export type SaleDocument = Sale & Document;

@Schema({ 
  timestamps: true,
  collection: 'sales'
})
export class Sale {
  @Prop({ required: true, unique: true, trim: true })
  saleNumber: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Client' })
  clientId?: Types.ObjectId;

  @Prop({ trim: true })
  customerName?: string;

  @Prop({ lowercase: true, trim: true })
  customerEmail?: string;

  @Prop({ trim: true })
  customerPhone?: string;

  @Prop({ 
    type: [{
      productId: { type: SchemaTypes.ObjectId, ref: 'Product', required: true },
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

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Prepaid' })
  prepaidId?: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  total: number;

  // Multi-payment: la suma de `payments[].amount` debe igualar `total`.
  // Para CASH se permite `receivedAmount > amount`; el excedente queda como
  // `changeGiven` (vuelto entregado al cliente).
  @Prop({
    type: [
      {
        method: { type: String, enum: Object.values(PaymentMethod), required: true },
        amount: { type: Number, required: true, min: 0 },
        receivedAmount: { type: Number, min: 0 },
        changeGiven: { type: Number, min: 0 },
      },
    ],
    required: true,
    validate: {
      validator: function (payments: Array<{ amount: number }>) {
        return Array.isArray(payments) && payments.length > 0;
      },
      message: 'La venta debe tener al menos un pago',
    },
  })
  payments: Array<{
    method: PaymentMethod;
    amount: number;
    receivedAmount?: number;
    changeGiven?: number;
  }>;

  @Prop({ required: true, enum: SaleStatus, default: SaleStatus.PENDING })
  status: SaleStatus;

  @Prop({ trim: true })
  notes?: string; 

  // Campos de facturación AFIP
  @Prop({ trim: true })
  afipCae?: string; // Código de Autorización Electrónico

  @Prop({ min: 0 })
  afipNumero?: number; // Número de comprobante AFIP

  @Prop({ trim: true })
  afipFechaVto?: string; // Fecha de vencimiento del CAE (YYYYMMDD)

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const SaleSchema = SchemaFactory.createForClass(Sale);

// Add indexes for better performance
// Nota: saleNumber ya tiene índice único por el decorador @Prop({ unique: true })
SaleSchema.index({ customerEmail: 1 });
SaleSchema.index({ status: 1 });
SaleSchema.index({ 'payments.method': 1 });
SaleSchema.index({ createdAt: -1 });
SaleSchema.index({ deletedAt: 1 });
SaleSchema.index({ 'items.productId': 1 });
// Índices para campos de facturación AFIP
SaleSchema.index({ afipCae: 1 });
SaleSchema.index({ afipNumero: 1 });
