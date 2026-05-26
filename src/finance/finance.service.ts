import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CashSessionDocument,
  EgressDocument,
  PrepaidDocument,
  SaleDocument,
} from '../common/schemas';
import { FinanceSummaryQueryDto } from '../common/dto';

export interface FinanceSummary {
  range: { from: string | null; to: string | null };
  filters: Record<string, string | undefined>;

  // Conteos generales del rango
  salesCount: number;
  totalRevenue: number; // Suma de Sale.total (no double-cuenta CASH change)
  averageTicket: number;

  // Distribución por método (suma de payments[].amount)
  byPaymentMethod: {
    CASH: number;
    CARD: number;
    TRANSFER: number;
  };

  // Estado de venta
  byStatus: {
    PENDING: number;
    COMPLETED: number;
    CANCELLED: number;
  };

  // Cliente vs anónimo
  byClient: {
    named: { count: number; total: number };
    anonymous: { count: number; total: number };
  };

  // Top productos vendidos (cantidad y revenue) — top 10
  topProducts: Array<{
    productId: string;
    productName: string;
    quantity: number;
    revenue: number;
  }>;

  // Egresos en el rango
  expenses: {
    count: number;
    total: number;
    byPaymentMethod: { CASH: number; CARD: number; TRANSFER: number };
  };

  // Prepaids (señas) en el rango
  prepaids: {
    count: number;
    total: number;
    byPaymentMethod: { CASH: number; CARD: number; TRANSFER: number };
  };

  // Saldo neto del rango (revenue + prepaids − egresos)
  netBalance: number;

  // Cajas: aperturas/cierres con discrepancias
  cashSessions: Array<{
    id: string;
    label: string | null;
    openedAt: Date;
    closedAt: Date | null;
    openingCash: number;
    expectedClosingCash: number | null;
    countedClosingCash: number | null;
    discrepancy: number | null;
    status: 'OPEN' | 'CLOSED';
    closureType: 'MANUAL' | 'AUTO';
  }>;

  // Discrepancia acumulada de las sesiones cerradas en el rango
  totalDiscrepancy: number;
}

@Injectable()
export class FinanceService {
  constructor(
    @InjectModel('Sale') private readonly saleModel: Model<SaleDocument>,
    @InjectModel('Prepaid') private readonly prepaidModel: Model<PrepaidDocument>,
    @InjectModel('Egress') private readonly egressModel: Model<EgressDocument>,
    @InjectModel('CashSession')
    private readonly cashSessionModel: Model<CashSessionDocument>,
  ) {}

  private parseDateRange(query: FinanceSummaryQueryDto): { from: Date; to: Date } {
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setHours(0, 0, 0, 0);
    const defaultTo = new Date(now);
    defaultTo.setHours(23, 59, 59, 999);

    const from = query.from ? new Date(`${query.from}T00:00:00`) : defaultFrom;
    const to = query.to ? new Date(`${query.to}T23:59:59.999`) : defaultTo;
    return { from, to };
  }

  async summary(query: FinanceSummaryQueryDto): Promise<FinanceSummary> {
    const { from, to } = this.parseDateRange(query);

    // Filtros base de Sale
    const saleMatch: Record<string, unknown> = {
      createdAt: { $gte: from, $lte: to },
      deletedAt: { $exists: false },
    };
    if (query.saleStatus) saleMatch.status = query.saleStatus;
    if (query.paymentMethod) saleMatch['payments.method'] = query.paymentMethod;
    if (query.productId) saleMatch['items.productId'] = new Types.ObjectId(query.productId);
    if (query.clientId === 'anonymous') saleMatch.clientId = { $exists: false };
    else if (query.clientId) saleMatch.clientId = new Types.ObjectId(query.clientId);

    const sales = await this.saleModel.find(saleMatch).lean().exec();

    // === Métricas básicas ===
    const salesCount = sales.length;
    const totalRevenue = sales.reduce((s, x) => s + (x.total || 0), 0);
    const averageTicket = salesCount > 0 ? totalRevenue / salesCount : 0;

    const byPaymentMethod: FinanceSummary['byPaymentMethod'] = {
      CASH: 0,
      CARD: 0,
      TRANSFER: 0,
    };
    const byStatus: FinanceSummary['byStatus'] = {
      PENDING: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };
    const byClient: FinanceSummary['byClient'] = {
      named: { count: 0, total: 0 },
      anonymous: { count: 0, total: 0 },
    };
    const productAgg = new Map<
      string,
      { productName: string; quantity: number; revenue: number }
    >();

    for (const sale of sales) {
      byStatus[sale.status as keyof FinanceSummary['byStatus']] =
        (byStatus[sale.status as keyof FinanceSummary['byStatus']] ?? 0) + 1;

      for (const p of sale.payments || []) {
        byPaymentMethod[p.method as keyof typeof byPaymentMethod] =
          (byPaymentMethod[p.method as keyof typeof byPaymentMethod] ?? 0) + p.amount;
      }

      if (sale.clientId) {
        byClient.named.count++;
        byClient.named.total += sale.total || 0;
      } else {
        byClient.anonymous.count++;
        byClient.anonymous.total += sale.total || 0;
      }

      for (const item of sale.items || []) {
        const id = item.productId.toString();
        const prev = productAgg.get(id) ?? {
          productName: item.productName,
          quantity: 0,
          revenue: 0,
        };
        prev.quantity += item.quantity;
        prev.revenue += item.subtotal;
        productAgg.set(id, prev);
      }
    }

    const topProducts = [...productAgg.entries()]
      .map(([productId, v]) => ({ productId, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // === Egresos en el rango ===
    const egressMatch: Record<string, unknown> = {
      createdAt: { $gte: from, $lte: to },
      deletedAt: { $exists: false },
    };
    if (query.paymentMethod) egressMatch.paymentMethod = query.paymentMethod;
    const egresses = await this.egressModel.find(egressMatch).lean().exec();
    const expensesByPm = { CASH: 0, CARD: 0, TRANSFER: 0 };
    let expensesTotal = 0;
    for (const e of egresses) {
      expensesTotal += e.amount || 0;
      if (e.paymentMethod && expensesByPm[e.paymentMethod as keyof typeof expensesByPm] !== undefined) {
        expensesByPm[e.paymentMethod as keyof typeof expensesByPm] += e.amount || 0;
      }
    }

    // === Prepaids en el rango ===
    const prepaidMatch: Record<string, unknown> = {
      createdAt: { $gte: from, $lte: to },
      deletedAt: { $exists: false },
    };
    if (query.paymentMethod) prepaidMatch.paymentMethod = query.paymentMethod;
    if (query.clientId === 'anonymous') prepaidMatch.clientId = { $exists: false };
    else if (query.clientId) prepaidMatch.clientId = new Types.ObjectId(query.clientId);
    const prepaids = await this.prepaidModel.find(prepaidMatch).lean().exec();
    const prepaidsByPm = { CASH: 0, CARD: 0, TRANSFER: 0 };
    let prepaidsTotal = 0;
    for (const p of prepaids) {
      prepaidsTotal += p.amount || 0;
      if (prepaidsByPm[p.paymentMethod as keyof typeof prepaidsByPm] !== undefined) {
        prepaidsByPm[p.paymentMethod as keyof typeof prepaidsByPm] += p.amount || 0;
      }
    }

    // === Sesiones de caja del rango ===
    const sessions = await this.cashSessionModel
      .find({ openedAt: { $gte: from, $lte: to } })
      .sort({ openedAt: -1 })
      .lean()
      .exec();
    const totalDiscrepancy = sessions.reduce(
      (s, ses) => s + (ses.discrepancy ?? 0),
      0,
    );

    const netBalance = totalRevenue + prepaidsTotal - expensesTotal;

    return {
      range: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
      },
      filters: {
        paymentMethod: query.paymentMethod,
        clientId: query.clientId,
        productId: query.productId,
        saleStatus: query.saleStatus,
      },
      salesCount,
      totalRevenue,
      averageTicket,
      byPaymentMethod,
      byStatus,
      byClient,
      topProducts,
      expenses: {
        count: egresses.length,
        total: expensesTotal,
        byPaymentMethod: expensesByPm,
      },
      prepaids: {
        count: prepaids.length,
        total: prepaidsTotal,
        byPaymentMethod: prepaidsByPm,
      },
      netBalance,
      cashSessions: sessions.map((s) => ({
        id: s._id.toString(),
        label: s.label ?? null,
        openedAt: s.openedAt,
        closedAt: s.closedAt ?? null,
        openingCash: s.openingCash,
        expectedClosingCash: s.expectedClosingCash ?? null,
        countedClosingCash: s.countedClosingCash ?? null,
        discrepancy: s.discrepancy ?? null,
        status: s.status,
        closureType: s.closureType ?? 'MANUAL',
      })),
      totalDiscrepancy,
    };
  }
}
