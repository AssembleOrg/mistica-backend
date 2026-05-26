import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CashSession,
  CashSessionDocument,
  SaleDocument,
  PrepaidDocument,
  EgressDocument,
} from '../common/schemas';
import {
  CloseCashSessionDto,
  OpenCashSessionDto,
  PaginationDto,
} from '../common/dto';
import {
  CajaNoAbiertaException,
  CajaYaAbiertaException,
  SesionDeCajaNoEncontradaException,
} from '../common/exceptions';
import { PaymentMethod } from '../common/enums';
import { PaginatedResponse } from '../common/interfaces';
import { BadRequestException } from '@nestjs/common';

export interface CashSessionResponse {
  id: string;
  status: 'OPEN' | 'CLOSED';
  label?: string;
  openedAt: Date;
  closedAt?: Date;
  openingCash: number;
  countedClosingCash?: number;
  expectedClosingCash?: number;
  discrepancy?: number;
  openingNotes?: string;
  closingNotes?: string;
  openedByUserId?: string;
  closedByUserId?: string;
}

@Injectable()
export class CashboxService {
  constructor(
    @InjectModel('CashSession')
    private readonly cashSessionModel: Model<CashSessionDocument>,
    @InjectModel('Sale') private readonly saleModel: Model<SaleDocument>,
    @InjectModel('Prepaid') private readonly prepaidModel: Model<PrepaidDocument>,
    @InjectModel('Egress') private readonly egressModel: Model<EgressDocument>,
  ) { }

  private mapToResponse(s: CashSessionDocument): CashSessionResponse {
    const obj = s.toObject ? s.toObject() : (s as any);
    return {
      id: obj._id.toString(),
      status: obj.status,
      label: obj.label,
      openedAt: obj.openedAt,
      closedAt: obj.closedAt,
      openingCash: obj.openingCash,
      countedClosingCash: obj.countedClosingCash,
      expectedClosingCash: obj.expectedClosingCash,
      discrepancy: obj.discrepancy,
      openingNotes: obj.openingNotes,
      closingNotes: obj.closingNotes,
      openedByUserId: obj.openedByUserId?.toString(),
      closedByUserId: obj.closedByUserId?.toString(),
    };
  }

  /**
   * Sesión actualmente abierta (o `null` si no hay).
   * Lo usa el frontend para renderizar el botón "Abrir caja" / "Cerrar caja".
   */
  async getCurrent(): Promise<CashSessionResponse | null> {
    const open = await this.cashSessionModel.findOne({ status: 'OPEN' }).exec();
    return open ? this.mapToResponse(open) : null;
  }

  /**
   * Devuelve la sesión abierta como Document. Útil para validar internamente
   * desde otros servicios sin pasar por la capa de mapeo.
   */
  async findOpenSession(): Promise<CashSessionDocument | null> {
    return this.cashSessionModel.findOne({ status: 'OPEN' }).exec();
  }

  async open(dto: OpenCashSessionDto, userId?: string): Promise<CashSessionResponse> {
    const existing = await this.findOpenSession();
    if (existing) throw new CajaYaAbiertaException();

    const session = await this.cashSessionModel.create({
      status: 'OPEN',
      openedAt: new Date(),
      openingCash: dto.openingCash,
      openingNotes: dto.notes,
      openedByUserId: userId,
    });
    return this.mapToResponse(session);
  }

  /**
   * Calcula el efectivo esperado al cierre de una sesión, basado en lo que
   * pasó entre `from` y `to`:
   *   esperado = openingCash
   *           + ventas en CASH (amount)
   *           + prepaids en CASH (amount)
   *           − egresos en CASH (amount)
   */
  private async computeExpectedClosingCash(
    openingCash: number,
    from: Date,
    to: Date,
  ): Promise<number> {
    // Acumular ventas en CASH del período: amount
    const salesAgg = await this.saleModel.aggregate([
      {
        $match: {
          createdAt: { $gte: from, $lte: to },
          deletedAt: { $exists: false },
          status: { $ne: 'CANCELLED' },
        },
      },
      { $unwind: '$payments' },
      { $match: { 'payments.method': PaymentMethod.CASH } },
      {
        $group: {
          _id: null,
          amount: { $sum: '$payments.amount' },
        },
      },
    ]);

    const salesCashAmount = salesAgg[0]?.amount ?? 0;

    // Prepaids en CASH del período
    const prepaidsAgg = await this.prepaidModel.aggregate([
      {
        $match: {
          createdAt: { $gte: from, $lte: to },
          deletedAt: { $exists: false },
          paymentMethod: PaymentMethod.CASH,
        },
      },
      {
        $group: {
          _id: null,
          amount: { $sum: '$amount' },
        },
      },
    ]);
    const prepaidsAmount = prepaidsAgg[0]?.amount ?? 0;

    // Egresos en CASH del período
    const egressesAgg = await this.egressModel.aggregate([
      {
        $match: {
          createdAt: { $gte: from, $lte: to },
          deletedAt: { $exists: false },
          paymentMethod: PaymentMethod.CASH,
          status: { $ne: 'CANCELLED' },
        },
      },
      { $group: { _id: null, amount: { $sum: '$amount' } } },
    ]);
    const egressAmount = egressesAgg[0]?.amount ?? 0;

    return Number(
      (openingCash + salesCashAmount + prepaidsAmount - egressAmount).toFixed(
        2,
      ),
    );
  }

  async close(
    dto: CloseCashSessionDto,
    userId?: string,
  ): Promise<CashSessionResponse> {
    const open = await this.findOpenSession();
    if (!open) throw new CajaNoAbiertaException();

    const closedAt = new Date();
    const expected = await this.computeExpectedClosingCash(
      open.openingCash,
      open.openedAt,
      closedAt,
    );
    const discrepancy = Number((dto.countedClosingCash - expected).toFixed(2));

    open.status = 'CLOSED';
    open.closedAt = closedAt;
    open.countedClosingCash = dto.countedClosingCash;
    open.expectedClosingCash = expected;
    open.discrepancy = discrepancy;
    open.closingNotes = dto.notes;
    open.closedByUserId = userId ? (userId as any) : undefined;
    await open.save();
    return this.mapToResponse(open);
  }

  async findAll(
    pagination?: PaginationDto,
  ): Promise<PaginatedResponse<CashSessionResponse>> {
    const { page = 1, limit = 10 } = pagination || {};
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      this.cashSessionModel
        .find()
        .sort({ openedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.cashSessionModel.countDocuments().exec(),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: sessions.map((s) => this.mapToResponse(s)),
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: string): Promise<CashSessionResponse> {
    const s = await this.cashSessionModel.findById(id).exec();
    if (!s) throw new SesionDeCajaNoEncontradaException(id);
    return this.mapToResponse(s);
  }

  /**
   * Renombra una sesión de caja. Un `label` vacío vuelve la sesión al nombre
   * por default (el front muestra día + fecha de apertura).
   */
  async updateLabel(id: string, label?: string): Promise<CashSessionResponse> {
    const s = await this.cashSessionModel.findById(id).exec();
    if (!s) throw new SesionDeCajaNoEncontradaException(id);
    const trimmed = (label ?? '').trim();
    s.set('label', trimmed || undefined);
    await s.save();
    return this.mapToResponse(s);
  }

  /**
   * Lista cronológica de movimientos (ventas + señas + egresos) ocurridos
   * durante una sesión de caja. Para sesiones abiertas usa `now` como límite
   * superior. Pensado para la vista "Transacciones" del tab de Ventas y para
   * el detalle de sesión en Finanzas.
   */
  async getSessionTransactions(sessionId: string): Promise<{
    sessionId: string;
    transactions: Array<{
      id: string;
      source: 'sale' | 'prepaid' | 'egress';
      type: 'ingreso' | 'egreso';
      amount: number;
      description: string;
      paymentMethod: string;
      createdAt: Date;
      reference?: string;
      afipCae?: string;
    }>;
  }> {
    const session = await this.cashSessionModel.findById(sessionId).exec();
    if (!session) throw new SesionDeCajaNoEncontradaException(sessionId);

    const from = session.openedAt;
    const to = session.closedAt ?? new Date();

    const [sales, prepaids, egresses] = await Promise.all([
      this.saleModel
        .find({
          createdAt: { $gte: from, $lte: to },
          deletedAt: { $exists: false },
          status: { $ne: 'CANCELLED' },
        })
        .lean()
        .exec(),
      this.prepaidModel
        .find({
          createdAt: { $gte: from, $lte: to },
          deletedAt: { $exists: false },
        })
        .lean()
        .exec(),
      this.egressModel
        .find({
          createdAt: { $gte: from, $lte: to },
          deletedAt: { $exists: false },
          status: { $ne: 'CANCELLED' },
        })
        .lean()
        .exec(),
    ]);

    const primaryMethod = (payments: any[] | undefined): string => {
      if (!payments || payments.length === 0) return 'CASH';
      if (payments.length === 1) return payments[0].method;
      // Mayor monto define el método principal; si empata, "MIXTO"
      const sorted = [...payments].sort((a, b) => b.amount - a.amount);
      if (sorted.length > 1 && sorted[0].amount === sorted[1].amount) return 'MIXTO';
      return sorted[0].method;
    };

    const txns: Array<{
      id: string;
      source: 'sale' | 'prepaid' | 'egress';
      type: 'ingreso' | 'egreso';
      amount: number;
      description: string;
      paymentMethod: string;
      createdAt: Date;
      reference?: string;
      afipCae?: string;
    }> = [];

    for (const s of sales as any[]) {
      txns.push({
        id: s._id.toString(),
        source: 'sale',
        type: 'ingreso',
        amount: s.total,
        description: `Venta ${s.saleNumber}${s.customerName ? ` · ${s.customerName}` : ''}`,
        paymentMethod: primaryMethod(s.payments),
        createdAt: s.createdAt,
        reference: s.saleNumber,
        afipCae: s.afipCae,
      });
    }

    for (const p of prepaids as any[]) {
      txns.push({
        id: p._id.toString(),
        source: 'prepaid',
        type: 'ingreso',
        amount: p.amount,
        description: p.notes || 'Seña',
        paymentMethod: p.paymentMethod,
        createdAt: p.createdAt,
        reference: p._id.toString(),
      });
    }

    for (const e of egresses as any[]) {
      txns.push({
        id: e._id.toString(),
        source: 'egress',
        type: 'egreso',
        amount: e.amount,
        description: `${e.egressNumber} · ${e.concept}`,
        paymentMethod: e.paymentMethod,
        createdAt: e.createdAt,
        reference: e.egressNumber,
      });
    }

    txns.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return { sessionId, transactions: txns };
  }

  async findPendingAutoClosure(): Promise<CashSessionResponse | null> {
    const s = await this.cashSessionModel.findOne({ closureType: 'AUTO' }).sort({ openedAt: -1 }).exec();
    return s ? this.mapToResponse(s) : null;
  }

  async autoClose() {
    const open = await this.findOpenSession();
    if (!open) return;

    const closedAt = new Date();
    const expected = await this.computeExpectedClosingCash(
      open.openingCash,
      open.openedAt,
      closedAt,
    );
    const discrepancy = Number((0 - expected).toFixed(2));

    open.status = 'CLOSED';
    open.closedAt = closedAt;
    open.countedClosingCash = 0;
    open.expectedClosingCash = expected;
    open.discrepancy = discrepancy;
    open.closingNotes = 'Cierre automático por el sistema';
    open.closedByUserId = undefined;
    open.closureType = 'AUTO';
    await open.save();
    return this.mapToResponse(open);
  }

  async resolveAutoClosure(id: string, dto: CloseCashSessionDto, userId?: string,): Promise<CashSessionResponse> {
    const session = await this.cashSessionModel.findById(id);
    if (!session) throw new SesionDeCajaNoEncontradaException(id);
    if (session.closureType !== 'AUTO') throw new BadRequestException('Solo se pueden ajustar cajas con cierre automático');

    const discrepancy = Number((dto.countedClosingCash - session.expectedClosingCash!).toFixed(2));
    session.countedClosingCash = dto.countedClosingCash;
    session.discrepancy = discrepancy;
    session.closedByUserId = userId as any;
    session.closingNotes = dto.notes ? dto.notes : 'Arqueado en diferido';
    session.closureType = 'MANUAL';
    await session.save();
    return this.mapToResponse(session);
  }

}
