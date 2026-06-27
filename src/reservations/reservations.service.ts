import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { CashboxService } from '../cashbox/cashbox.service';
import {
  AdminCreateReservationDto,
  CreateHoldDto,
  ListReservationsQueryDto,
} from '../common/dto/reservation.dto';
import {
  PaymentMethod,
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
  Reservation,
  ReservationDocument,
} from '../common/schemas/reservation.schema';
import {
  ReservationPayment,
  ReservationPaymentDocument,
} from '../common/schemas/reservation-payment.schema';
import { MercadopagoService } from '../mercadopago/mercadopago.service';

// Minutos que vive un hold sin pago antes de liberar el cupo.
const HOLD_MINUTES = 10;

// Error de clave duplicada de MongoDB.
const DUP_KEY = 11000;

interface MongoDupError {
  code?: number;
  keyPattern?: Record<string, number>;
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
    private readonly mercadopago: MercadopagoService,
    private readonly cashbox: CashboxService,
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

    const unitPrice = session.price;
    const amount = unitPrice * qty;
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
        amount,
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
      const pref = await this.mercadopago.createPreference({
        reservationId: String(reservation._id),
        title: `${session.experienceName} (${qty} ${qty > 1 ? 'personas' : 'persona'})`,
        quantity: qty,
        unitPrice,
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
    if (won) return;

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
    const amount = dto.amount ?? unitPrice * qty;
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

    // Impacto en caja (sólo si hay cobro real).
    if (!isCourtesy && amount > 0) {
      try {
        const income = await this.cashbox.createIncome(
          {
            concept: `Reserva ${reservation.code} · ${session.experienceName}`,
            amount,
            paymentMethod: this.toCashPaymentMethod(dto.paymentMethod),
            notes: dto.notes,
          },
          userId,
        );
        reservation.cashIncomeId = new Types.ObjectId(income.id);
        await reservation.save();
      } catch (err) {
        // Caja cerrada u otro error: revertimos la reserva para no dejar un
        // cobro sin respaldo en caja.
        await this.releaseSeats(session._id as Types.ObjectId, qty);
        await this.reservationModel.deleteOne({ _id: reservation._id });
        throw err;
      }
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

  private toCashPaymentMethod(m: ReservationPaymentMethod): PaymentMethod {
    switch (m) {
      case ReservationPaymentMethod.TRANSFER:
        return PaymentMethod.TRANSFER;
      case ReservationPaymentMethod.CARD:
        return PaymentMethod.CARD;
      default:
        return PaymentMethod.CASH;
    }
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
      amount: r.amount,
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
