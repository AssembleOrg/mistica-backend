import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EgressCategoryDocument = EgressCategory & Document;

/**
 * Categoría de egreso (Sueldos, Servicios, Impuestos, Gastos del día…).
 * CRUD del admin; cada egreso puede llevar una y el listado filtra por ella.
 * Los egresos guardan snapshot del nombre: renombrar la categoría no
 * reescribe la historia.
 */
@Schema({ timestamps: true, collection: 'egress_categories' })
export class EgressCategory {
  @Prop({ required: true, trim: true })
  name: string;

  // Color hex (#RRGGBB) para el chip en los listados.
  @Prop({ trim: true })
  color?: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Date })
  deletedAt?: Date;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const EgressCategorySchema =
  SchemaFactory.createForClass(EgressCategory);

EgressCategorySchema.index({ deletedAt: 1, isActive: 1 });
