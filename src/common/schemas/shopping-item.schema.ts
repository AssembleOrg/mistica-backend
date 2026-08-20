import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type ShoppingItemDocument = ShoppingItem & Document;

/**
 * Ítem de la lista de compras interna del staff (insumos y productos que
 * hacen falta). Pensada para cargar rápido durante la actividad diaria:
 * nombre, cantidad opcional en texto libre y listo.
 */
@Schema({ timestamps: true, collection: 'shopping_items' })
export class ShoppingItem {
  @Prop({ required: true, trim: true })
  name: string;

  // Cantidad/medida en texto libre ('2 cajas', '5 kg').
  @Prop({ trim: true })
  quantity?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ required: true, enum: ['PENDING', 'BOUGHT'], default: 'PENDING' })
  status: 'PENDING' | 'BOUGHT';

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  addedById?: Types.ObjectId;

  @Prop({ trim: true })
  addedByName?: string;

  @Prop({ type: Date })
  boughtAt?: Date;

  @Prop({ type: Date })
  deletedAt?: Date;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const ShoppingItemSchema = SchemaFactory.createForClass(ShoppingItem);

ShoppingItemSchema.index({ deletedAt: 1, status: 1, createdAt: -1 });
