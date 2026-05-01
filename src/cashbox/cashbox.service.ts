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

export interface CashSessionResponse {
  id: string;
  status: 'OPEN' | 'CLOSED';
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
  ) {}

  private mapToResponse(s: CashSessionDocument): CashSessionResponse {
    const obj = s.toObject ? s.toObject() : (s as any);
    return {
      id: obj._id.toString(),
      status: obj.status,
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
   *           − vueltos en CASH (changeGiven en sales y prepaids)
   *
   * El changeGiven se descuenta porque sale físicamente de la caja.
   */
  private async computeExpectedClosingCash(
    openingCash: number,
    from: Date,
    to: Date,
  ): Promise<number> {
    // Acumular ventas en CASH del período: amount + (-changeGiven)
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
          change: { $sum: { $ifNull: ['$payments.changeGiven', 0] } },
        },
      },
    ]);

    const salesCashAmount = salesAgg[0]?.amount ?? 0;
    const salesCashChange = salesAgg[0]?.change ?? 0;

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
          change: { $sum: { $ifNull: ['$changeGiven', 0] } },
        },
      },
    ]);
    const prepaidsAmount = prepaidsAgg[0]?.amount ?? 0;
    const prepaidsChange = prepaidsAgg[0]?.change ?? 0;

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
      (
        openingCash +
        salesCashAmount +
        prepaidsAmount -
        egressAmount -
        salesCashChange -
        prepaidsChange
      ).toFixed(2),
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
}
