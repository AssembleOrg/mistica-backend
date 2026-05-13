import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ProductKind, UnitOfMeasure } from '../enums';

export type ProductDocument = Product & Document;

@Schema({
  timestamps: true,
  collection: 'products'
})
export class Product {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, trim: true })
  barcode: string;

  // Categoría como free-text. Apunta al `name` de un documento de Category.
  // Se hizo opcional para no romper datos existentes durante la migración.
  @Prop({ trim: true })
  category?: string;

  @Prop({ required: true, min: 0 })
  price: number;

  // Precio de costo es opcional: los servicios y señas no lo necesitan.
  @Prop({ min: 0 })
  costPrice?: number;

  // Stock no aplica a SERVICE ni PREPAID; default 0 para STANDARD.
  @Prop({ min: 0, default: 0 })
  stock: number;

  @Prop({ enum: UnitOfMeasure })
  unitOfMeasure?: UnitOfMeasure;

  @Prop({ trim: true })
  image?: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ min: 0 })
  profitMargin?: number;

  @Prop({ type: Boolean, default: false })
  specialProduct: boolean;

  //   STANDARD = producto físico con stock
  //   SERVICE  = item sin stock (servicio prestado)
  //   PREPAID  = línea virtual que crea una seña al venderse
  @Prop({ required: true, enum: ProductKind, default: ProductKind.STANDARD })
  kind: ProductKind;

  @Prop({ type: Date, default: Date.now })
  createdAt: Date;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Add indexes for better performance
// Nota: barcode ya tiene índice único por el decorador @Prop({ unique: true })
ProductSchema.index({ category: 1 });
ProductSchema.index({ status: 1 });
ProductSchema.index({ stock: 1 });
ProductSchema.index({ price: 1 });
ProductSchema.index({ name: 'text', description: 'text' });
