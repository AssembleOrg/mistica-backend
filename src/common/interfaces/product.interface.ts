import { ProductKind, UnitOfMeasure } from '../enums';

export interface Product {
  id?: string;
  _id?: string;
  name: string;
  barcode: string;
  category?: string;
  price: number;
  costPrice?: number;
  stock: number;
  unitOfMeasure?: UnitOfMeasure;
  image?: string;
  description?: string;
  profitMargin: number | null;
  specialProduct: boolean;
  kind: ProductKind;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
