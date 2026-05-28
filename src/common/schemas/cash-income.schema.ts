import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { PaymentMethod } from '../enums';

export type CashIncomeDocument = CashIncome & Document;

/**
 * Ingresos puntuales/correcciones de saldo. Son distintos de las ventas:
 * NO tienen items ni cliente, son entradas de plata sueltas (ajustes, etc.).
 *
 * Hoy se crean desde la edición de una sesión cerrada (egresos/ingresos
 * retroactivos en `PATCH /cashbox/:id/edit`); su `createdAt` se fija dentro
 * de la ventana de esa sesión para que el arqueo los cuente.
 */
@Schema({
  timestamps: true,
  collection: 'cash_incomes',
})
export class CashIncome {
  @Prop({ required: true, unique: true, trim: true })
  incomeNumber: string;

  @Prop({ required: true, trim: true })
  concept: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  userId?: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const CashIncomeSchema = SchemaFactory.createForClass(CashIncome);

CashIncomeSchema.index({ createdAt: -1 });
CashIncomeSchema.index({ deletedAt: 1 });
CashIncomeSchema.index({ paymentMethod: 1 });
