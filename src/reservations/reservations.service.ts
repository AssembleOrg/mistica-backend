import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'node:crypto';
import { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import { CashboxService } from '../cashbox/cashbox.service';
import { envConfig } from '../config/env.config';
import {
  AdminCreateReservationDto,
  AdminUpdateReservationDto,
  CreateHoldDto,
  ListReservationsQueryDto,
} from '../common/dto/reservation.dto';
import { AddSalePaymentsDto } from '../common/dto/sale.dto';
import {
  PaymentMethod,
  ProductKind,
  ReservationPaymentMethod,
  ReservationSource,
  ReservationStatus,
  SessionStatus,
} from '../common/enums';
import {
  ExperienceSession,
  ExperienceSessionDocument,
} from '../common/schemas/experience-session.schema';
import {
  Product,
  ProductDocument,
} from '../common/schemas/product.schema';
import {
  Reservation,
  ReservationDocument,
} from '../common/schemas/reservation.schema';
import {
  ReservationPayment,
  ReservationPaymentDocument,
} from '../common/schemas/reservation-payment.schema';
import { CreateSaleDto } from '../common/dto/sale.dto';
import { MercadopagoService } from '../mercadopago/mercadopago.service';
import { NotificationsService } from '../notifications/notifications.service';
import { computeReservationAmounts } from './reservation-amounts';
import { SalesService } from '../sales/sales.service';
import { ClosedDatesService } from '../closed-dates/closed-dates.service';

// Minutos que vive un hold sin pago antes de liberar el cupo.
const HOLD_MINUTES = 10;

// Error de clave duplicada de MongoDB.
const DUP_KEY = 11000;

interface MongoDupError {
  code?: number;
  keyPattern?: Record<string, number>;
}

/** Escapa metacaracteres para usar un texto libre dentro de un RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<ReservationDocument>,
    @InjectModel(ExperienceSession.name)
    private readonly sessionModel: Model<ExperienceSessionDocument>,
    @InjectModel(ReservationPayment.name)
    private readonly paymentModel: Model<ReservationPaymentDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly mercadopago: MercadopagoService,
    private readonly cashbox: CashboxService,
    private readonly salesService: SalesService,
    private readonly notifications: NotificationsService,
    private readonly closedDates: ClosedDatesService,
  ) {}

  // ───────────────────────── Público: hold + pago ─────────────────────────

  /**
   * Crea un hold (reserva PENDING) que descuenta cupo atómicamente y arranca el
   * pago con MercadoPago. Devuelve el init_point para redirigir.
   */
  async createHold(dto: CreateHoldDto) {
    // Idempotencia: si ya existe un hold con esta clave, lo devolvemos tal cual
    // (no descontamos cupo de nuevo).
    const existing = await this.reservationModel
      .findOne({ idempotencyKey: dto.idempotencyKey })
      .exec();
    if (existing) {
      return this.holdResponse(existing);
    }

    const qty = dto.quantity;
    const session = await this.reserveSeats(dto.sessionId, qty, [
      SessionStatus.OPEN,
    ]);

    // Guarda de día cerrado: aunque exista el turno, si la fecha quedó marcada
    // como cerrada (se cargó después), no permitimos reservar. Devolvemos el
    // cupo recién tomado.
    const closed = await this.closedDates.isClosed(session.startAt);
    if (closed.closed) {
      await this.releaseSeats(session._id as Types.ObjectId, qty);
      throw new BadRequestException(
        `Ese día el local no abre${closed.reason ? ` (${closed.reason})` : ''}. Elegí otra fecha.`,
      );
    }

    const unitPrice = session.price;
    // Seña: en Mística se cobra el 50% al reservar; el resto queda pendiente.
    const pct = session.depositPct ?? 50;
    const { total, deposit, balanceDue } = computeReservationAmounts(
      unitPrice,
      qty,
      pct,
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HOLD_MINUTES * 60_000);

    let reservation: ReservationDocument;
    try {
      reservation = await this.createReservationWithCode({
        sessionId: session._id as Types.ObjectId,
        experienceId: session.experienceId,
        experienceName: session.experienceName,
        startAt: session.startAt,
        unitPrice,
        quantity: qty,
        amount: deposit,
        totalAmount: total,
        depositAmount: deposit,
        balanceDue,
        status: ReservationStatus.PENDING,
        source: ReservationSource.PUBLIC,
        paymentMethod: ReservationPaymentMethod.MERCADOPAGO,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        customerPhone: dto.customerPhone,
        idempotencyKey: dto.idempotencyKey,
        expiresAt,
      });
    } catch (err) {
      // Compensación: si no se pudo crear la reserva, devolvemos el cupo.
      await this.releaseSeats(session._id as Types.ObjectId, qty);
      const dup = err as MongoDupError;
      if (dup?.code === DUP_KEY && dup.keyPattern?.idempotencyKey) {
        // Carrera de doble-click: ganó otro request con la misma clave.
        const winner = await this.reservationModel
          .findOne({ idempotencyKey: dto.idempotencyKey })
          .exec();
        if (winner) return this.holdResponse(winner);
      }
      throw err;
    }

    // Crear la preference de MercadoPago. Si falla, no hay forma de pagar:
    // cancelamos la reserva y liberamos el cupo.
    try {
      const personas = `${qty} ${qty > 1 ? 'personas' : 'persona'}`;
      const seniaLabel =
        pct >= 100 ? '' : ` · Seña ${pct}%`;
      const pref = await this.mercadopago.createPreference({
        reservationId: String(reservation._id),
        title: `${session.experienceName} (${personas})${seniaLabel}`,
        // Cobramos la seña como un único ítem (no el total).
        quantity: 1,
        unitPrice: deposit,
        expiresAt,
        payer: { name: dto.customerName, email: dto.customerEmail },
      });
      reservation.preferenceId = pref.id;
      reservation.mpInitPoint = pref.initPoint;
      reservation.mpExternalReference = String(reservation._id);
      await reservation.save();
    } catch (err) {
      this.logger.error(
        `Preference falló para reserva ${String(reservation._id)}: ${String(err)}`,
      );
      reservation.status = ReservationStatus.CANCELLED;
      reservation.cancelledAt = new Date();
      await reservation.save();
      await this.releaseSeats(session._id as Types.ObjectId, qty);
      throw new BadRequestException(
        'No se pudo iniciar el pago. Intentá de nuevo.',
      );
    }

    return this.holdResponse(reservation);
  }

  /** Estado de una reserva por id (para polling del front). */
  async getStatus(id: string) {
    const r = await this.findByIdOrThrow(id);
    return this.publicView(r);
  }

  /** Búsqueda pública por código de gestión. */
  async getByCode(code: string) {
    const r = await this.reservationModel
      .findOne({
        code: code.trim().toUpperCase(),
        deletedAt: { $exists: false },
      })
      .exec();
    if (!r) throw new NotFoundException('Reserva no encontrada');
    return this.publicView(r);
  }

  /**
   * Cancelación pública por código. PENDING ⇒ libera y marca CANCELLED.
   * CONFIRMED pagada con MP ⇒ libera, marca CANCELLED y dispara reembolso.
   */
  async cancelByCode(code: string) {
    const r = await this.reservationModel
      .findOne({
        code: code.trim().toUpperCase(),
        deletedAt: { $exists: false },
      })
      .exec();
    if (!r) throw new NotFoundException('Reserva no encontrada');

    if (
      r.status === ReservationStatus.CANCELLED ||
      r.status === ReservationStatus.EXPIRED
    ) {
      return this.publicView(r);
    }
    if (r.status === ReservationStatus.NEEDS_REVIEW) {
      throw new ConflictException(
        'Esta reserva está en revisión. Contactá al local.',
      );
    }

    const wasConfirmed = r.status === ReservationStatus.CONFIRMED;

    // Transición atómica para no liberar dos veces (carrera con cron/webhook).
    const won = await this.reservationModel.findOneAndUpdate(
      {
        _id: r._id,
        status: {
          $in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
        },
      },
      {
        $set: { status: ReservationStatus.CANCELLED, cancelledAt: new Date() },
      },
      { new: true },
    );
    if (!won) return this.publicView(await this.findByIdOrThrow(String(r._id)));

    await this.releaseSeats(won.sessionId, won.quantity);

    if (
      wasConfirmed &&
      won.paymentMethod === ReservationPaymentMethod.MERCADOPAGO
    ) {
      await this.refundReservation(won);
    }
    return this.publicView(won);
  }

  // ───────────────────────── Webhook MercadoPago ─────────────────────────

  /**
   * Procesa la aprobación/rechazo de un pago. Idempotente por `mpPaymentId`.
   * Maneja el borde "pago aprobado después de expirar el hold".
   */
  async confirmFromPayment(paymentId: string): Promise<void> {
    const payment = await this.mercadopago.getPayment(paymentId);
    if (!payment) {
      this.logger.warn(`Pago ${paymentId} no encontrado en MP`);
      return;
    }

    // Idempotencia: el primer insert gana; los reintentos de MP chocan E11000.
    try {
      await this.paymentModel.create({
        mpPaymentId: String(payment.id),
        preferenceId: undefined,
        externalReference: payment.external_reference,
        amount: payment.transaction_amount,
        status: payment.status,
        rawResponse: payment as unknown as Record<string, unknown>,
      });
    } catch (err) {
      if ((err as MongoDupError)?.code === DUP_KEY) {
        this.logger.log(`Pago ${paymentId} ya procesado (idempotente)`);
        return;
      }
      throw err;
    }

    const reservationId = payment.external_reference;
    if (!reservationId || !Types.ObjectId.isValid(reservationId)) {
      this.logger.warn(`Pago ${paymentId} sin external_reference válido`);
      return;
    }

    await this.paymentModel.updateOne(
      { mpPaymentId: String(payment.id) },
      { $set: { reservationId: new Types.ObjectId(reservationId) } },
    );

    if (payment.status !== 'approved') {
      // Rechazado/cancelado: el hold expira solo por el cron. Nada que hacer.
      return;
    }

    const now = new Date();
    // Camino feliz: el hold sigue PENDING ⇒ confirmamos (cupo ya retenido).
    const won = await this.reservationModel.findOneAndUpdate(
      { _id: reservationId, status: ReservationStatus.PENDING },
      { $set: { status: ReservationStatus.CONFIRMED, confirmedAt: now } },
      { new: true },
    );
    if (won) {
      await this.createSaleForReservation(won, PaymentMethod.MERCADOPAGO);
      await this.notifyConfirmed(won);
      return;
    }

    // No estaba PENDING. Ver por qué.
    const r = await this.reservationModel.findById(reservationId).exec();
    if (!r) {
      this.logger.error(
        `Reserva ${reservationId} no existe para pago ${paymentId}`,
      );
      return;
    }
    if (r.status === ReservationStatus.CONFIRMED) return; // ya confirmada

    if (
      r.status === ReservationStatus.EXPIRED ||
      r.status === ReservationStatus.CANCELLED
    ) {
      // Pago llegó tarde. Intentamos re-tomar cupo.
      try {
        await this.reserveSeats(String(r.sessionId), r.quantity, [
          SessionStatus.OPEN,
          SessionStatus.CLOSED,
        ]);
        r.status = ReservationStatus.CONFIRMED;
        r.confirmedAt = now;
        await r.save();
        this.logger.log(`Reserva ${reservationId} re-tomada tras pago tardío`);
        await this.createSaleForReservation(r, PaymentMethod.MERCADOPAGO);
      } catch {
        // Sin cupo: marcar para revisión y reembolsar.
        r.status = ReservationStatus.NEEDS_REVIEW;
        await r.save();
        this.logger.warn(
          `Reserva ${reservationId}: pago tardío sin cupo ⇒ NEEDS_REVIEW + refund`,
        );
        await this.refundReservation(r);
      }
    }
  }

  // ───────────────────────── Cron: expirar holds ─────────────────────────

  /** Marca EXPIRED los holds vencidos y devuelve su cupo. Idempotente. */
  async expireHolds(): Promise<number> {
    const now = new Date();
    const due = await this.reservationModel
      .find({ status: ReservationStatus.PENDING, expiresAt: { $lt: now } })
      .select('_id sessionId quantity')
      .limit(200)
      .lean();

    let released = 0;
    for (const hold of due) {
      const won = await this.reservationModel.findOneAndUpdate(
        {
          _id: hold._id,
          status: ReservationStatus.PENDING,
          expiresAt: { $lt: now },
        },
        { $set: { status: ReservationStatus.EXPIRED } },
        { new: true },
      );
      if (won) {
        await this.releaseSeats(won.sessionId, won.quantity);
        released++;
      }
    }
    if (released) this.logger.log(`Holds expirados liberados: ${released}`);
    return released;
  }

  // ───────────────────────── Admin ─────────────────────────

  /**
   * Crea una reserva desde el panel admin (nace CONFIRMED). Descuenta cupo
   * atómico igual. Si el método no es COURTESY, impacta caja con un ingreso.
   */
  async adminCreateReservation(
    dto: AdminCreateReservationDto,
    userId?: string,
  ) {
    const qty = dto.quantity;
    const session = await this.reserveSeats(dto.sessionId, qty, [
      SessionStatus.OPEN,
      SessionStatus.CLOSED,
      SessionStatus.DRAFT,
    ]);

    const unitPrice = session.price;
    const total = unitPrice * qty;
    // El admin puede cobrar el total o una seña (dto.amount). El saldo es el resto.
    const amount = dto.amount ?? total;
    const balanceDue = Math.max(0, total - amount);
    const isCourtesy = dto.paymentMethod === ReservationPaymentMethod.COURTESY;

    let reservation: ReservationDocument;
    try {
      reservation = await this.createReservationWithCode({
        sessionId: session._id as Types.ObjectId,
        experienceId: session.experienceId,
        experienceName: session.experienceName,
        startAt: session.startAt,
        unitPrice,
        quantity: qty,
        amount,
        totalAmount: total,
        depositAmount: isCourtesy ? 0 : amount,
        balanceDue: isCourtesy ? 0 : balanceDue,
        status: ReservationStatus.CONFIRMED,
        source: ReservationSource.ADMIN,
        paymentMethod: dto.paymentMethod,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        customerPhone: dto.customerPhone,
        clientId: dto.clientId,
        notes: dto.notes,
        createdById: userId,
        confirmedAt: new Date(),
      });
    } catch (err) {
      await this.releaseSeats(session._id as Types.ObjectId, qty);
      throw err;
    }

    // Registrar la VENTA (experiencia como servicio + pago de seña/total). Para
    // control. Cortesía no genera venta. Si la caja está cerrada, queda diferida.
    if (!isCourtesy && amount > 0) {
      await this.createSaleForReservation(
        reservation,
        this.mapToSalePaymentMethod(dto.paymentMethod),
      );
    }

    return this.publicView(reservation);
  }

  /** Listado paginado para el admin (con filtros). */
  async list(query: ListReservationsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (query.status) filter.status = query.status;
    if (query.sessionId) filter.sessionId = new Types.ObjectId(query.sessionId);
    if (query.experienceId)
      filter.experienceId = new Types.ObjectId(query.experienceId);

    // Búsqueda libre: por nombre (con el texto tal cual) y por código/teléfono
    // (sin separadores, así "LKU-867" matchea el code guardado "LKU867").
    const term = query.search?.trim();
    if (term) {
      const nameRx = new RegExp(escapeRegex(term), 'i');
      const or: Record<string, unknown>[] = [{ customerName: nameRx }];
      const compact = term.replace(/[^a-zA-Z0-9]/g, '');
      if (compact) {
        const rx = new RegExp(escapeRegex(compact), 'i');
        or.push({ code: rx }, { customerPhone: rx });
      }
      filter.$or = or;
    }

    const [items, total] = await Promise.all([
      this.reservationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.reservationModel.countDocuments(filter),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /** Anotados de un turno (para "ver los anotados"). */
  async listBySession(sessionId: string) {
    if (!Types.ObjectId.isValid(sessionId))
      throw new BadRequestException('sessionId inválido');
    return this.reservationModel
      .find({
        sessionId: new Types.ObjectId(sessionId),
        status: {
          $in: [ReservationStatus.CONFIRMED, ReservationStatus.PENDING],
        },
        deletedAt: { $exists: false },
      })
      .sort({ createdAt: 1 })
      .lean();
  }

  // ───────────────────────── Helpers internos ─────────────────────────

  /**
   * Descuento de cupo ATÓMICO sobre el documento del turno. La guarda
   * `capacity - seatsTaken >= qty` ($expr) + `$inc seatsTaken` garantiza que
   * nunca se sobrevenda, sin transacciones (mongod standalone).
   */
  private async reserveSeats(
    sessionId: string | Types.ObjectId,
    qty: number,
    allowedStatuses: SessionStatus[],
  ): Promise<ExperienceSessionDocument> {
    if (!Types.ObjectId.isValid(String(sessionId)))
      throw new BadRequestException('sessionId inválido');

    const updated = await this.sessionModel.findOneAndUpdate(
      {
        _id: sessionId,
        status: { $in: allowedStatuses },
        deletedAt: { $exists: false },
        $expr: { $gte: [{ $subtract: ['$capacity', '$seatsTaken'] }, qty] },
      },
      { $inc: { seatsTaken: qty }, $set: { updatedAt: new Date() } },
      { new: true },
    );

    if (!updated) {
      const exists = await this.sessionModel.findById(sessionId).lean();
      if (!exists || exists.deletedAt)
        throw new NotFoundException('Turno no encontrado');
      if (!allowedStatuses.includes(exists.status))
        throw new ConflictException('El turno no acepta reservas');
      throw new ConflictException('Sin cupo disponible');
    }
    return updated;
  }

  /** Devuelve cupo al turno (con guarda para no bajar de 0). */
  private async releaseSeats(
    sessionId: Types.ObjectId,
    qty: number,
  ): Promise<void> {
    const res = await this.sessionModel.updateOne(
      { _id: sessionId, seatsTaken: { $gte: qty } },
      { $inc: { seatsTaken: -qty }, $set: { updatedAt: new Date() } },
    );
    if (res.modifiedCount === 0) {
      this.logger.error(
        `releaseSeats no aplicó (session ${String(sessionId)}, qty ${qty}). Revisar conteo.`,
      );
    }
  }

  /** Crea la reserva generando un código único, reintentando ante colisión. */
  private async createReservationWithCode(
    data: Omit<Partial<Reservation>, 'clientId' | 'createdById'> & {
      sessionId: Types.ObjectId;
      experienceId: Types.ObjectId;
      clientId?: string;
      createdById?: string;
    },
  ): Promise<ReservationDocument> {
    const { clientId, createdById, ...rest } = data;
    const base: Partial<Reservation> = { ...rest };
    if (clientId) base.clientId = new Types.ObjectId(clientId);
    if (createdById) base.createdById = new Types.ObjectId(createdById);

    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        return await this.reservationModel.create({
          ...base,
          code: this.randomCode(),
        });
      } catch (err) {
        const dup = err as MongoDupError;
        // Sólo reintentamos si la colisión fue por el código.
        if (dup?.code === DUP_KEY && dup.keyPattern?.code) continue;
        throw err;
      }
    }
    throw new ConflictException('No se pudo generar el código de reserva');
  }

  /** Código de 6 caracteres: 3 letras + 3 números (ej. "MIS482"). */
  private randomCode(): string {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I/O para evitar confusión
    const digits = '0123456789';
    let out = '';
    for (let i = 0; i < 3; i++) out += letters[randomInt(letters.length)];
    for (let i = 0; i < 3; i++) out += digits[randomInt(digits.length)];
    return out;
  }

  private async refundReservation(r: ReservationDocument): Promise<void> {
    const payment = await this.paymentModel
      .findOne({ reservationId: r._id, status: 'approved' })
      .sort({ createdAt: -1 })
      .lean();
    if (!payment) {
      this.logger.warn(
        `Sin pago aprobado para reembolsar reserva ${String(r._id)}`,
      );
      return;
    }
    const ok = await this.mercadopago.refundPayment(payment.mpPaymentId);
    this.logger.log(
      `Refund reserva ${String(r._id)} pago ${payment.mpPaymentId}: ${ok ? 'OK' : 'FALLÓ'}`,
    );
  }

  private mapToSalePaymentMethod(m: ReservationPaymentMethod): PaymentMethod {
    switch (m) {
      case ReservationPaymentMethod.MERCADOPAGO:
        return PaymentMethod.MERCADOPAGO;
      case ReservationPaymentMethod.TRANSFER:
        return PaymentMethod.TRANSFER;
      case ReservationPaymentMethod.CARD:
        return PaymentMethod.CARD;
      default:
        return PaymentMethod.CASH;
    }
  }

  /**
   * Asegura que exista un Product (kind=SERVICE) para la experiencia, para poder
   * usarla como línea de venta. Idempotente por barcode `EXP-<experienceId>`.
   */
  private async ensureExperienceProduct(
    experienceId: Types.ObjectId,
    name: string,
    price: number,
  ): Promise<Types.ObjectId> {
    const barcode = `EXP-${String(experienceId)}`;
    const existing = await this.productModel.findOne({ barcode }).exec();
    if (existing) return existing._id as Types.ObjectId;
    const created = await this.productModel.create({
      name,
      barcode,
      category: 'Experiencias',
      price,
      stock: 0,
      kind: ProductKind.SERVICE,
    });
    return created._id as Types.ObjectId;
  }

  /**
   * Registra una VENTA para la reserva (experiencia como servicio + pago parcial
   * de la seña). Nace PARTIAL si queda saldo, así sobrevive al cierre de caja y
   * el saldo se cobra luego por el flujo POS (`addPayments`).
   *
   * Si la caja está cerrada (típico en webhooks 24/7), NO crea la venta: marca
   * `salePending` y un cron la crea al abrir caja. Nunca lanza: un fallo de venta
   * no debe tumbar la confirmación de la reserva.
   */
  private async createSaleForReservation(
    reservation: ReservationDocument,
    method: PaymentMethod,
  ): Promise<void> {
    if (reservation.saleId) return; // ya tiene venta
    if (!reservation.depositAmount || reservation.depositAmount <= 0) return;

    const openSession = await this.cashbox.findOpenSession();
    if (!openSession) {
      reservation.salePending = true;
      await reservation.save();
      this.logger.log(
        `Reserva ${reservation.code}: caja cerrada ⇒ venta diferida`,
      );
      return;
    }

    try {
      const productId = await this.ensureExperienceProduct(
        reservation.experienceId,
        reservation.experienceName,
        reservation.unitPrice,
      );
      const dto: CreateSaleDto = {
        customerName: reservation.customerName,
        customerEmail: reservation.customerEmail,
        customerPhone: reservation.customerPhone,
        items: [
          {
            productId: String(productId),
            quantity: reservation.quantity,
            unitPrice: reservation.unitPrice,
          },
        ],
        payments: [{ method, amount: reservation.depositAmount }],
        isPartial: true,
        seller: 'Reservas',
        notes: `Reserva ${reservation.code} · ${reservation.experienceName}`,
      };
      const sale = await this.salesService.create(dto);
      const saleId = (sale as unknown as { _id: Types.ObjectId })._id;
      reservation.saleId = saleId;
      reservation.salePending = false;
      await reservation.save();
      this.logger.log(`Reserva ${reservation.code}: venta registrada`);
    } catch (err) {
      reservation.salePending = true;
      await reservation.save();
      this.logger.error(
        `Reserva ${reservation.code}: no se pudo registrar la venta: ${String(err)}`,
      );
    }
  }

  /**
   * Cron: registra las ventas pendientes de reservas confirmadas, una vez que la
   * caja está abierta. Idempotente (cada venta se crea una sola vez).
   */
  async processPendingReservationSales(): Promise<number> {
    const openSession = await this.cashbox.findOpenSession();
    if (!openSession) return 0;
    const pending = await this.reservationModel
      .find({
        salePending: true,
        saleId: { $exists: false },
        status: ReservationStatus.CONFIRMED,
        deletedAt: { $exists: false },
      })
      .limit(50)
      .exec();
    let created = 0;
    for (const r of pending) {
      await this.createSaleForReservation(
        r,
        this.mapToSalePaymentMethod(r.paymentMethod),
      );
      if (r.saleId) created++;
    }
    if (created) this.logger.log(`Ventas de reservas registradas: ${created}`);
    return created;
  }

  // ───────────────────────── Notificaciones ─────────────────────────

  private fmtWhen(d: Date): string {
    return DateTime.fromJSDate(d)
      .setZone(envConfig.timezone)
      .setLocale('es')
      .toFormat("cccc d 'de' LLLL 'a las' HH:mm 'hs'");
  }

  /** Aviso al cliente cuando su reserva queda confirmada (post-pago). */
  private async notifyConfirmed(r: ReservationDocument): Promise<void> {
    if (!r.customerPhone) return;
    const personas = `${r.quantity} ${r.quantity > 1 ? 'personas' : 'persona'}`;
    const saldo =
      r.balanceDue > 0
        ? `Abonaste la seña. Saldo a completar en el local: $${r.balanceDue}.\n\n`
        : '';
    const msg =
      `¡Tu reserva quedó confirmada! 🎉\n\n` +
      `*${r.experienceName}*\n${this.fmtWhen(r.startAt)}\n${personas}\n` +
      `Código: *${r.code}*\n\n${saldo}¡Te esperamos! 💛`;
    await this.notifications.notify(r.customerPhone, msg);
  }

  /** Recordatorios de turnos próximos (~24 h). Idempotente vía reminderSentAt. */
  async sendDueReminders(): Promise<number> {
    const now = new Date();
    const from = new Date(now.getTime() + 18 * 3600_000);
    const to = new Date(now.getTime() + 30 * 3600_000);
    const due = await this.reservationModel
      .find({
        status: ReservationStatus.CONFIRMED,
        startAt: { $gte: from, $lte: to },
        reminderSentAt: { $exists: false },
        deletedAt: { $exists: false },
      })
      .limit(100)
      .exec();
    let sent = 0;
    for (const r of due) {
      if (r.customerPhone) {
        const ok = await this.notifications.notify(
          r.customerPhone,
          `Te recordamos tu reserva en Mística ✨\n\n*${r.experienceName}*\n` +
            `${this.fmtWhen(r.startAt)}\nCódigo: *${r.code}*\n\n¡Te esperamos! 💛`,
        );
        if (ok) sent++;
      }
      r.reminderSentAt = now;
      await r.save();
    }
    if (sent) this.logger.log(`Recordatorios enviados: ${sent}`);
    return sent;
  }

  // ───────────────────────── Admin: acciones sobre reservas ─────────────────

  async adminCancel(id: string) {
    const r = await this.findByIdOrThrow(id);
    if (
      r.status === ReservationStatus.CANCELLED ||
      r.status === ReservationStatus.EXPIRED
    ) {
      return this.publicView(r);
    }
    const wasConfirmed = r.status === ReservationStatus.CONFIRMED;
    const won = await this.reservationModel.findOneAndUpdate(
      {
        _id: r._id,
        status: {
          $in: [
            ReservationStatus.PENDING,
            ReservationStatus.CONFIRMED,
            ReservationStatus.NEEDS_REVIEW,
          ],
        },
      },
      { $set: { status: ReservationStatus.CANCELLED, cancelledAt: new Date() } },
      { new: true },
    );
    if (!won) return this.publicView(await this.findByIdOrThrow(id));
    await this.releaseSeats(won.sessionId, won.quantity);
    if (
      wasConfirmed &&
      won.paymentMethod === ReservationPaymentMethod.MERCADOPAGO
    ) {
      await this.refundReservation(won);
    }
    return this.publicView(won);
  }

  async adminResolveReview(id: string, action: 'confirm' | 'cancel') {
    const r = await this.findByIdOrThrow(id);
    if (r.status !== ReservationStatus.NEEDS_REVIEW) {
      throw new ConflictException('La reserva no está en revisión.');
    }
    if (action === 'cancel') {
      r.status = ReservationStatus.CANCELLED;
      r.cancelledAt = new Date();
      await r.save();
      if (r.paymentMethod === ReservationPaymentMethod.MERCADOPAGO) {
        await this.refundReservation(r);
      }
      return this.publicView(r);
    }
    // confirm: re-tomar cupo y registrar venta.
    await this.reserveSeats(String(r.sessionId), r.quantity, [
      SessionStatus.OPEN,
      SessionStatus.CLOSED,
    ]);
    r.status = ReservationStatus.CONFIRMED;
    r.confirmedAt = new Date();
    await r.save();
    await this.createSaleForReservation(
      r,
      this.mapToSalePaymentMethod(r.paymentMethod),
    );
    return this.publicView(r);
  }

  async adminUpdate(id: string, dto: AdminUpdateReservationDto) {
    const r = await this.findByIdOrThrow(id);
    if (dto.customerName !== undefined) r.customerName = dto.customerName;
    if (dto.customerEmail !== undefined) r.customerEmail = dto.customerEmail;
    if (dto.customerPhone !== undefined) r.customerPhone = dto.customerPhone;
    if (dto.notes !== undefined) r.notes = dto.notes;
    r.updatedAt = new Date();
    await r.save();
    return this.publicView(r);
  }

  /** Cobra el saldo pendiente sobre la venta vinculada (flujo POS). */
  async adminCollectBalance(id: string, dto: AddSalePaymentsDto) {
    const r = await this.findByIdOrThrow(id);
    if (!r.saleId) {
      throw new BadRequestException(
        'La reserva no tiene una venta asociada para cobrar el saldo.',
      );
    }
    await this.salesService.addPayments(String(r.saleId), {
      ...dto,
      markCompleted: dto.markCompleted ?? true,
    });
    r.balanceDue = 0;
    await r.save();
    return this.publicView(r);
  }

  private async findByIdOrThrow(id: string): Promise<ReservationDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const r = await this.reservationModel.findById(id).exec();
    if (!r || r.deletedAt) throw new NotFoundException('Reserva no encontrada');
    return r;
  }

  private holdResponse(r: ReservationDocument) {
    return {
      reservationId: String(r._id),
      code: r.code,
      status: r.status,
      amount: r.amount, // seña cobrada
      depositAmount: r.depositAmount,
      totalAmount: r.totalAmount,
      balanceDue: r.balanceDue,
      quantity: r.quantity,
      expiresAt: r.expiresAt,
      initPoint: r.mpInitPoint,
      preferenceId: r.preferenceId,
    };
  }

  private publicView(r: ReservationDocument) {
    return {
      reservationId: String(r._id),
      code: r.code,
      status: r.status,
      experienceName: r.experienceName,
      startAt: r.startAt,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      amount: r.amount,
      depositAmount: r.depositAmount,
      totalAmount: r.totalAmount,
      balanceDue: r.balanceDue,
      paymentMethod: r.paymentMethod,
      source: r.source,
      customerName: r.customerName,
      customerEmail: r.customerEmail,
      customerPhone: r.customerPhone,
      expiresAt: r.expiresAt,
      confirmedAt: r.confirmedAt,
      cancelledAt: r.cancelledAt,
      notes: r.notes,
      createdAt: r.createdAt,
    };
  }
}
