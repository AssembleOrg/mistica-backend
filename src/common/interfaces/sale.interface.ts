import { PaymentMethod, SaleStatus } from '../enums';

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface Sale {
  id: string;
  saleNumber: string;
  clientId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  items: SaleItem[];
  subtotal: number;
  tax: number;
  discount: number;
  prepaidId?: string;
  total: number;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface CreateSaleItemDto {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface DailySalesSummary {
  totalSales: number;
  totalAmount: number;
  totalByPaymentMethod: Record<PaymentMethod, number>;
  totalByStatus: Record<SaleStatus, number>;
}

export interface DailySalesResponse {
  date: string;
  timezone: string;
  sales: Array<{
    id: string;
    saleNumber: string;
    customerName?: string;
    total: number;
    paymentMethod: PaymentMethod;
    status: SaleStatus;
    createdAt: Date;
  }>;
  summary: DailySalesSummary;
}
