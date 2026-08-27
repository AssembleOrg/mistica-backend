import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { Currency, EgressType, EgressStatus, PaymentMethod } from '../enums';

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

  @Prop({ required: true, enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Prop({ required: true, enum: Currency, default: Currency.USD })
  currency: Currency;

  @Prop({ required: true, enum: EgressType })
  type: EgressType;

  @Prop({ required: true, enum: EgressStatus, default: EgressStatus.PENDING })
  status: EgressStatus;

  /**
   * ¿Descuenta de la CAJA FÍSICA? Default true. false = gasto EXTERNO: sale
   * de otra cuenta (banco, plata del dueño), cuenta para finanzas y reportes
   * pero NO para el arqueo de la caja (no baja el efectivo esperado ni figura
   * entre los movimientos de la sesión). Caso real: sueldos pagados con plata
   * que nunca estuvo en el cajón.
   */
  @Prop({ type: Boolean, default: true })
  affectsCashbox: boolean;

  // Categoría del gasto (Sueldos, Servicios, Impuestos…) + snapshot del
  // nombre para listar sin join y conservar la historia ante renombres.
  @Prop({ type: SchemaTypes.ObjectId, ref: 'EgressCategory' })
  categoryId?: Types.ObjectId;

  @Prop({ trim: true })
  categoryName?: string;

  @Prop({ trim: true })
  notes?: string; // Notas adicionales

  @Prop({ trim: true })
  authorizedBy?: string; // Persona que autoriza el egreso

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  userId?: Types.ObjectId; // Usuario que registra el egreso

  // Marca manual tipo "checkbox de Excel" en el detalle de sesión de caja.
  // Sólo estado visual/persistido: no afecta ningún cálculo ni flujo.
  @Prop({ type: Boolean, default: false })
  checked: boolean;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const EgressSchema = SchemaFactory.createForClass(Egress);

// Add indexes for better performance
// Nota: egressNumber ya tiene índice único por el decorador @Prop({ unique: true })
EgressSchema.index({ concept: 'text' });
EgressSchema.index({ status: 1 });
EgressSchema.index({ type: 1 });
EgressSchema.index({ currency: 1 });
EgressSchema.index({ createdAt: -1 });
EgressSchema.index({ deletedAt: 1 });
EgressSchema.index({ userId: 1 });