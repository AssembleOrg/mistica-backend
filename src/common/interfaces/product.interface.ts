import { ProductCategory, ProductStatus, UnitOfMeasure } from '../enums';

export interface Product {
  id?: string; // Optional since Mongoose uses _id
  _id?: string; // Mongoose ObjectId
  name: string;
  barcode: string;
  category: ProductCategory;
  price: number;
  costPrice: number;
  stock: number;
  unitOfMeasure: UnitOfMeasure;
  image: string;
  description: string;
  status: ProductStatus;
  profitMargin: number | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
} 