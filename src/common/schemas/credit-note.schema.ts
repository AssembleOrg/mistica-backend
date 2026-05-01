import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CreditNoteDocument = CreditNote & Document;

export type CreditNoteStatus = 'AUTHORIZED' | 'FAILED' | 'CANCELLED' | 'INTERNAL';

/**
 * Nota de Crédito vinculada a una venta. Se usa para anular total o
 * parcialmente una venta. Si la venta tenía factura AFIP, se intenta emitir
 * la NC contra AFIP (tipo 13, Nota de Crédito C). Si la venta no tenía
 * factura, igual se registra como NC interna (status `INTERNAL`).
 */
@Schema({
  timestamps: true,
  collection: 'credit_notes',
})
export class CreditNote {
  @Prop({ required: true, unique: true, trim: true })
  noteNumber: string; // ej. NC-2026-0501-001

  @Prop({ type: Types.ObjectId, ref: 'Sale', required: true, index: true })
  saleId: Types.ObjectId;

  @Prop({ trim: true })
  saleNumber?: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ trim: true })
  reason?: string;

  @Prop({ required: true, enum: ['AUTHORIZED', 'FAILED', 'CANCELLED', 'INTERNAL'], default: 'INTERNAL' })
  status: CreditNoteStatus;

  // AFIP fields (cuando aplique)
  @Prop({ trim: true })
  afipCae?: string;

  @Prop({ min: 0 })
  afipNumero?: number;

  @Prop({ trim: true })
  afipFechaVto?: string;

  @Prop({ trim: true })
  afipError?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  issuedByUserId?: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const CreditNoteSchema = SchemaFactory.createForClass(CreditNote);

CreditNoteSchema.index({ saleId: 1, createdAt: -1 });
CreditNoteSchema.index({ status: 1 });
CreditNoteSchema.index({ afipCae: 1 });
CreditNoteSchema.index({ createdAt: -1 });
