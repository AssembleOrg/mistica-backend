import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CategoryDocument = Category & Document;

/**
 * Categorías de productos administrables por el cliente. Los productos
 * referencian la categoría por su `name` como free-text (no por ObjectId),
 * para mantener simple el modelo. El `name` es único y trim.
 */
@Schema({ timestamps: true, collection: 'categories' })
export class Category {
  @Prop({ required: true, unique: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  /** Color hex opcional para badges (#9d684e). */
  @Prop({ trim: true })
  color?: string;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
CategorySchema.index({ deletedAt: 1 });
