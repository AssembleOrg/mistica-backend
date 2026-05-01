import { PaymentMethod, SaleStatus } from '../enums';

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface SalePayment {
  method: PaymentMethod;
  /** Monto imputado a este método (lo que cuenta para la reportería). */
  amount: number;
  /** Sólo CASH: lo que entregó el cliente físicamente (≥ amount). */
  receivedAmount?: number;
  /** Sólo CASH: vuelto entregado al cliente (= receivedAmount - amount). */
  changeGiven?: number;
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
  tax: number; // Porcentaje de impuesto (0-100)
  discount: number; // Porcentaje de descuento (0-100)
  prepaidUsed: number; // Monto en dinero usado de prepaid
  prepaidId?: string;
  total: number;
  payments: SalePayment[];
  status: SaleStatus;
  notes?: string;
  afipCae?: string; // Código de Autorización Electrónico
  afipNumero?: number; // Número de comprobante AFIP
  afipFechaVto?: string; // Fecha de vencimiento del CAE (YYYYMMDD)
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
  /** Total cobrado por cada método (suma de `payments[].amount`). */
  totalByPaymentMethod: Record<PaymentMethod, number>;
  /** Total entregado de vuelto en cash (sale physical de la caja). */
  totalCashChange: number;
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
    payments: SalePayment[];
    status: SaleStatus;
    createdAt: Date;
  }>;
  summary: DailySalesSummary;
}
