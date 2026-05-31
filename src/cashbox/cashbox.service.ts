import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CashSession,
  CashSessionDocument,
  SaleDocument,
  PrepaidDocument,
  EgressDocument,
  CashIncomeDocument,
} from '../common/schemas';
import {
  CloseCashSessionDto,
  EditCashSessionDto,
  OpenCashSessionDto,
  PaginationDto,
} from '../common/dto';
import {
  CajaNoAbiertaException,
  CajaYaAbiertaException,
  SesionDeCajaNoEncontradaException,
} from '../common/exceptions';
import { Currency, EgressStatus, PaymentMethod, SaleStatus } from '../common/enums';
import { PaginatedResponse } from '../common/interfaces';
import { DateTime } from 'luxon';

export interface CashSessionEditEntry {
  editedAt: Date;
  editedByUserId?: string;
  addedEgresses: Array<{
    egressId: string;
    egressNumber: string;
    concept: string;
    amount: number;
    paymentMethod: string;
  }>;
  addedIncomes: Array<{
    incomeId: string;
    incomeNumber: string;
    concept: string;
    amount: number;
    paymentMethod: string;
  }>;
}

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
  editHistory: CashSessionEditEntry[];
}

@Injectable()
export class CashboxService {
  constructor(
    @InjectModel('CashSession')
    private readonly cashSessionModel: Model<CashSessionDocument>,
    @InjectModel('Sale') private readonly saleModel: Model<SaleDocument>,
    @InjectModel('Prepaid') private readonly prepaidModel: Model<PrepaidDocument>,
    @InjectModel('Egress') private readonly egressModel: Model<EgressDocument>,
    @InjectModel('CashIncome') private readonly cashIncomeModel: Model<CashIncomeDocument>,
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
      editHistory: (obj.editHistory ?? []).map((e: any) => ({
        editedAt: e.editedAt,
        editedByUserId: e.editedByUserId?.toString(),
        addedEgresses: (e.addedEgresses ?? []).map((a: any) => ({
          egressId: a.egressId?.toString(),
          egressNumber: a.egressNumber,
          concept: a.concept,
          amount: a.amount,
          paymentMethod: a.paymentMethod,
        })),
        addedIncomes: (e.addedIncomes ?? []).map((a: any) => ({
          incomeId: a.incomeId?.toString(),
          incomeNumber: a.incomeNumber,
          concept: a.concept,
          amount: a.amount,
          paymentMethod: a.paymentMethod,
        })),
      })),
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

  /**
   * Esperado en vivo de la sesión actualmente abierta (preview pre-cierre).
   * Aplica la misma fórmula que `close()` pero sin escribir nada: el frontend
   * lo usa en el diálogo "Cerrar caja" para mostrar al cajero cuánto debería
   * tener antes de tipear el conteo físico.
   *
   * Devuelve null si no hay caja abierta.
   */
  async getCurrentExpected(): Promise<{
    sessionId: string;
    openedAt: Date;
    openingCash: number;
    expectedClosingCash: number;
    asOf: Date;
  } | null> {
    const open = await this.findOpenSession();
    if (!open) return null;
    const asOf = new Date();
    const expectedClosingCash = await this.computeExpectedClosingCash(
      open.openingCash,
      open.openedAt,
      asOf,
    );
    return {
      sessionId: String(open._id),
      openedAt: open.openedAt,
      openingCash: open.openingCash,
      expectedClosingCash,
      asOf,
    };
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
    // Acumular ventas en CASH del período. Filtramos por la fecha de CADA
    // pago, no por sale.createdAt: una venta PARTIAL puede tener pagos en
    // sesiones distintas (el saldo se completa después), y cada pago debe
    // contar para la caja del día en que entró.
    const salesAgg = await this.saleModel.aggregate([
      {
        $match: {
          deletedAt: { $exists: false },
          status: { $ne: 'CANCELLED' },
        },
      },
      { $unwind: '$payments' },
      {
        $match: {
          'payments.method': PaymentMethod.CASH,
          'payments.createdAt': { $gte: from, $lte: to },
        },
      },
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

    // Ingresos puntuales (correcciones de saldo, etc.) en CASH del período.
    // Suman al esperado (entran a la caja).
    const incomesAgg = await this.cashIncomeModel.aggregate([
      {
        $match: {
          createdAt: { $gte: from, $lte: to },
          deletedAt: { $exists: false },
          paymentMethod: PaymentMethod.CASH,
        },
      },
      { $group: { _id: null, amount: { $sum: '$amount' } } },
    ]);
    const incomesAmount = incomesAgg[0]?.amount ?? 0;

    return Number(
      (
        openingCash +
        salesCashAmount +
        prepaidsAmount +
        incomesAmount -
        egressAmount
      ).toFixed(2),
    );
  }

  /**
   * Al cerrar la caja, toda venta PENDING creada durante el período de la
   * sesión (entre `from` y `to`) pasa a COMPLETED ("confirmada"). Es sólo un
   * cambio de estado: no factura en AFIP ni mueve stock (el stock ya se
   * descontó al crear la venta). Devuelve cuántas ventas se confirmaron.
   */
  private async confirmPendingSales(from: Date, to: Date): Promise<number> {
    const res = await this.saleModel.updateMany(
      {
        createdAt: { $gte: from, $lte: to },
        status: SaleStatus.PENDING,
        deletedAt: { $exists: false },
      },
      { $set: { status: SaleStatus.COMPLETED } },
    );
    return res.modifiedCount ?? 0;
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
    await this.confirmPendingSales(open.openedAt, closedAt);
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
   * Genera un número de egreso usando como prefijo la fecha pasada (no `now`).
   * Para egresos retroactivos, así el EGR-yyyymmdd refleja la fecha real del
   * gasto (la de la sesión a la que se cargó).
   */
  private async generateEgressNumberForDate(when: Date): Promise<string> {
    const dateStr = DateTime.fromJSDate(when).toFormat('yyyyMMdd');
    const prefix = `EGR-${dateStr}`;
    const latest = await this.egressModel
      .findOne({ egressNumber: { $regex: `^${prefix}` }, deletedAt: null })
      .sort({ egressNumber: -1 })
      .lean();
    if (!latest) return `${prefix}-001`;
    const seq = parseInt(latest.egressNumber.split('-')[2], 10) + 1;
    return `${prefix}-${String(seq).padStart(3, '0')}`;
  }

  private async generateIncomeNumberForDate(when: Date): Promise<string> {
    const dateStr = DateTime.fromJSDate(when).toFormat('yyyyMMdd');
    const prefix = `INC-${dateStr}`;
    const latest = await this.cashIncomeModel
      .findOne({ incomeNumber: { $regex: `^${prefix}` }, deletedAt: null })
      .sort({ incomeNumber: -1 })
      .lean();
    if (!latest) return `${prefix}-001`;
    const seq = parseInt(latest.incomeNumber.split('-')[2], 10) + 1;
    return `${prefix}-${String(seq).padStart(3, '0')}`;
  }

  /**
   * Edita una sesión cerrada agregando egresos retroactivos. Reglas:
   *  - Sólo se permite si la sesión está CLOSED.
   *  - `closedAt` debe haber sido hace menos de 72 hs.
   *  - Cada egreso se crea con `createdAt = session.closedAt`, así pertenece
   *    a la ventana de esa sesión y el arqueo lo cuenta correctamente.
   *  - Después de crear los egresos se recalculan `expectedClosingCash` y
   *    `discrepancy` y se persisten.
   *  - Se agrega una entrada a `editHistory` con snapshot de lo cargado
   *    (útil para auditoría incluso si el egreso se borra después).
   */
  async editSession(
    id: string,
    dto: EditCashSessionDto,
    userId?: string,
  ): Promise<CashSessionResponse> {
    const session = await this.cashSessionModel.findById(id).exec();
    if (!session) throw new SesionDeCajaNoEncontradaException(id);

    if (session.status !== 'CLOSED' || !session.closedAt) {
      throw new BadRequestException(
        'Sólo se pueden editar sesiones de caja cerradas.',
      );
    }

    const hoursSinceClose =
      (Date.now() - session.closedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceClose > 72) {
      throw new ForbiddenException(
        'Esta sesión se cerró hace más de 72 horas y ya no se puede editar.',
      );
    }

    const egressesIn = dto.addEgresses ?? [];
    const incomesIn = dto.addIncomes ?? [];
    if (egressesIn.length === 0 && incomesIn.length === 0) {
      throw new BadRequestException(
        'Debe agregar al menos un egreso o un ingreso para editar la sesión.',
      );
    }

    const occurredAt = session.closedAt;
    const createdEgresses: Array<{
      egressId: any;
      egressNumber: string;
      concept: string;
      amount: number;
      paymentMethod: string;
    }> = [];
    const createdIncomes: Array<{
      incomeId: any;
      incomeNumber: string;
      concept: string;
      amount: number;
      paymentMethod: string;
    }> = [];

    for (const e of egressesIn) {
      const egressNumber = await this.generateEgressNumberForDate(occurredAt);
      const doc = await this.egressModel.create({
        egressNumber,
        concept: e.concept,
        amount: e.amount,
        paymentMethod: e.paymentMethod,
        type: e.type,
        notes: e.notes,
        currency: Currency.ARS,
        status: EgressStatus.PENDING,
        userId: userId ? (userId as any) : undefined,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      });
      createdEgresses.push({
        egressId: doc._id,
        egressNumber: doc.egressNumber,
        concept: doc.concept,
        amount: doc.amount,
        paymentMethod: doc.paymentMethod,
      });
    }

    for (const i of incomesIn) {
      const incomeNumber = await this.generateIncomeNumberForDate(occurredAt);
      const doc = await this.cashIncomeModel.create({
        incomeNumber,
        concept: i.concept,
        amount: i.amount,
        paymentMethod: i.paymentMethod,
        notes: i.notes,
        userId: userId ? (userId as any) : undefined,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      });
      createdIncomes.push({
        incomeId: doc._id,
        incomeNumber: doc.incomeNumber,
        concept: doc.concept,
        amount: doc.amount,
        paymentMethod: doc.paymentMethod,
      });
    }

    // Recalcular esperado y discrepancia con el nuevo set de movimientos en
    // ventana. computeExpectedClosingCash ya incluye ingresos CASH (+) y
    // egresos CASH (−) del período.
    const newExpected = await this.computeExpectedClosingCash(
      session.openingCash,
      session.openedAt,
      session.closedAt,
    );
    const counted = session.countedClosingCash ?? 0;
    const newDiscrepancy = Number((counted - newExpected).toFixed(2));

    session.expectedClosingCash = newExpected;
    session.discrepancy = newDiscrepancy;
    session.editHistory.push({
      editedAt: new Date(),
      editedByUserId: userId ? (userId as any) : undefined,
      addedEgresses: createdEgresses,
      addedIncomes: createdIncomes,
    });
    await session.save();
    return this.mapToResponse(session);
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
      source: 'sale' | 'prepaid' | 'egress' | 'income';
      type: 'ingreso' | 'egreso';
      amount: number;
      description: string;
      paymentMethod: string;
      createdAt: Date;
      reference?: string;
      afipCae?: string;
      isSena?: boolean;
    }>;
  }> {
    const session = await this.cashSessionModel.findById(sessionId).exec();
    if (!session) throw new SesionDeCajaNoEncontradaException(sessionId);

    const from = session.openedAt;
    const to = session.closedAt ?? new Date();

    const [sales, prepaids, egresses, incomes] = await Promise.all([
      // Una venta entra en la sesión si ALGÚN pago suyo cae en la ventana.
      // (Ventas PARCIALES pueden tener pagos en sesiones distintas; el row
      // representa el aporte de esa venta a esta sesión.)
      this.saleModel
        .find({
          deletedAt: { $exists: false },
          status: { $ne: 'CANCELLED' },
          'payments.createdAt': { $gte: from, $lte: to },
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
      this.cashIncomeModel
        .find({
          createdAt: { $gte: from, $lte: to },
          deletedAt: { $exists: false },
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
      source: 'sale' | 'prepaid' | 'egress' | 'income';
      type: 'ingreso' | 'egreso';
      amount: number;
      description: string;
      paymentMethod: string;
      createdAt: Date;
      reference?: string;
      afipCae?: string;
      // true cuando el movimiento es una seña: prepaid (saldo a favor) o
      // venta con saldo pendiente (status PARTIAL). El front lo usa para el
      // chip "Seña" unificado en el detalle de sesión.
      isSena?: boolean;
    }> = [];

    for (const s of sales as any[]) {
      // Para la sesión sólo cuentan los pagos que entraron en la ventana.
      // En ventas no-PARCIALES, esto coincide con todos los pagos (mismo
      // instante que sale.createdAt). En PARCIALES queda el subconjunto.
      const paymentsInWindow = (s.payments || []).filter((p: any) => {
        const t = p.createdAt ? new Date(p.createdAt).getTime() : new Date(s.createdAt).getTime();
        return t >= from.getTime() && t <= to.getTime();
      });
      if (paymentsInWindow.length === 0) continue;
      const amountInWindow = paymentsInWindow.reduce(
        (acc: number, p: any) => acc + (p.amount || 0),
        0,
      );
      // Tomamos la fecha del último pago en ventana para ubicar el row
      // cronológicamente dentro de la sesión.
      const lastPayment = paymentsInWindow.reduce((acc: any, p: any) => {
        const tAcc = acc?.createdAt ? new Date(acc.createdAt).getTime() : 0;
        const tP = p.createdAt ? new Date(p.createdAt).getTime() : 0;
        return tP >= tAcc ? p : acc;
      }, paymentsInWindow[0]);
      const customerSuffix = s.customerName ? ` · ${s.customerName}` : '';
      let partialSuffix = '';
      if (s.status === 'PARTIAL') {
        partialSuffix = ' · seña';
      } else if (amountInWindow !== s.total) {
        partialSuffix = ' · pago de seña';
      }
      // Mostramos el nombre amigable de la venta si el operador lo cargó
      // (ej. "Seña cumple 30/5"); si no, caemos al número de venta autogenerado.
      const saleDisplay = s.name?.trim() ? s.name.trim() : `Venta ${s.saleNumber}`;
      txns.push({
        id: s._id.toString(),
        source: 'sale',
        type: 'ingreso',
        amount: amountInWindow,
        description: `${saleDisplay}${customerSuffix}${partialSuffix}`,
        paymentMethod: primaryMethod(paymentsInWindow),
        createdAt: lastPayment.createdAt ?? s.createdAt,
        reference: s.saleNumber,
        afipCae: s.afipCae,
        isSena: s.status === 'PARTIAL',
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
        isSena: true,
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

    for (const i of incomes as any[]) {
      txns.push({
        id: i._id.toString(),
        source: 'income',
        type: 'ingreso',
        amount: i.amount,
        description: `${i.incomeNumber} · ${i.concept}`,
        paymentMethod: i.paymentMethod,
        createdAt: i.createdAt,
        reference: i.incomeNumber,
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
    await this.confirmPendingSales(open.openedAt, closedAt);
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
