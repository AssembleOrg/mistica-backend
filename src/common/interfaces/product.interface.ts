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
  // Motivo del movimiento de stock (ej. "Consumo taller — Mel"). Sólo se
  // completa en updateStock cuando el request lo envía; queda en el registro
  // de auditoría (AuditInterceptor lee la respuesta). No se persiste en el
  // documento del producto.
  stockChangeReason?: string;
}
