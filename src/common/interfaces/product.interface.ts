import { ProductCategory, ProductStatus, UnitOfMeasure } from '@prisma/client';

export interface Product {
  id: string;
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
  deletedAt: Date | null;
} 