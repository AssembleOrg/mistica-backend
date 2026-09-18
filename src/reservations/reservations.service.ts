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
  AdminRescheduleReservationDto,
  AdminUpdateReservationDto,
  CreateHoldDto,
  ListReservationsQueryDto,
  TransferProofDto,
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
import { Product, ProductDocument } from '../common/schemas/product.schema';
import {
  Experience,
  ExperienceDocument,
} from '../common/schemas/experience.schema';
import { effectiveUnitPrice } from '../common/pricing';
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
import { TablesService } from '../tables/tables.service';
import { businessDateKey } from '../tables/shifts';
import { AvailabilityService } from './availability.service';
import { UserRole } from '../common/enums/user-role.enum';

// Minutos que vive un hold esperando el comprobante de transferencia antes de
// liberar el cupo y las mesas (el cliente transfiere y manda la captura por
// WhatsApp). 30 min: amigable — son reservas aisladas, no hay presión de cupo
// por minuto que justifique apurar al cliente.
const TRANSFER_HOLD_MINUTES = 90;

// Política de modificaciones: se aceptan hasta 48 h antes del turno original.
const RESCHEDULE_MIN_HOURS = 48;

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

interface Actor {
  id?: string;
  role?: string;
  allowedViews?: string[];
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
    @InjectModel(Experience.name)
    private readonly experienceModel: Model<ExperienceDocument>,
    private readonly mercadopago: MercadopagoService,
    private readonly cashbox: CashboxService,
    private readonly salesService: SalesService,
    private readonly notifications: NotificationsService,
    private readonly closedDates: ClosedDatesService,
    private readonly tables: TablesService,
    private readonly availability: AvailabilityService,
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
    // El turno se resuelve del trío (experiencia, día, bloque) y se crea solo
    // si todavía no existe: el equipo ya no carga turnos a mano.
    const sessionId = await this.resolveSessionId(dto);
    const session = await this.reserveSeats(sessionId, qty, [
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

    // Guarda de MESAS: el grupo tiene que entrar en las mesas libres del turno.
    // Se chequea antes de crear la reserva para fallar barato y con un mensaje
    // útil (incluido el pedido de aceptar mesa compartida).
    const preview = await this.tables.previewAssignment({
      qty,
      startAt: session.startAt,
      durationMinutes: session.durationMinutes,
      sharedAccepted: dto.acceptSharedTable,
    });
    if (!preview.fits) {
      await this.releaseSeats(session._id as Types.ObjectId, qty);
      throw this.tableError(preview.reason);
    }

    // Precio efectivo: el del turno, salvo que una promo aplique (tier por
    // cantidad, promo por día de semana o por fecha). Si es CUMPLEAÑOS, las
    // promos son los beneficios del doc Cumpleaños sobre el precio de la
    // experiencia elegida. La promo puede bonificar lugares: se cobran
    // billableQty personas.
    const { unitPrice, billableQty } = await this.effectivePriceFor(
      session.experienceId,
      session.price,
      qty,
      session.startAt,
      dto.isBirthday,
    );
    // Seña: en Mística se cobra el 50% al reservar; el resto queda pendiente.
    const pct = session.depositPct ?? 50;
    const { total, deposit, balanceDue } = computeReservationAmounts(
      unitPrice,
      billableQty,
      pct,
    );
    // El único medio de pago del cliente es la TRANSFERENCIA con comprobante:
    // MercadoPago quedó fuera del flujo público (ver docs y env.config).
    const holdMinutes = TRANSFER_HOLD_MINUTES;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + holdMinutes * 60_000);

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
        paymentMethod: ReservationPaymentMethod.TRANSFER,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        customerPhone: dto.customerPhone,
        idempotencyKey: dto.idempotencyKey,
        dietaryTags: dto.dietaryTags ?? [],
        dietaryNotes: dto.dietaryNotes,
        isBirthday: dto.isBirthday ?? false,
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

    // Asignación REAL de mesas (atómica, todo-o-nada). Si perdimos la carrera
    // contra otra reserva entre el preview y acá, se cancela y se devuelve cupo.
    try {
      await this.attachTables(reservation, session, dto.acceptSharedTable);
    } catch (err) {
      reservation.status = ReservationStatus.CANCELLED;
      reservation.cancelledAt = new Date();
      await reservation.save();
      await this.releaseSeats(session._id as Types.ObjectId, qty);
      throw err;
    }

    // TESTING (AUTO_CONFIRM_HOLDS): la reserva nace confirmada sin esperar el
    // comprobante. El bot detecta status=CONFIRMED y no pide la transferencia.
    if (envConfig.autoConfirmHolds) {
      reservation.status = ReservationStatus.CONFIRMED;
      reservation.confirmedAt = new Date();
      await reservation.save();
      return this.holdResponse(reservation);
    }

    // El hold queda esperando el comprobante de transferencia: el bot lo lee
    // con visión y llama resolveTransferProof para confirmarlo.
    return this.holdResponse(reservation);
  }

  /**
   * Turno sobre el que se calcula un preview. Si todavía no existe (nadie
   * reservó ese día en ese bloque), se arma uno EN MEMORIA con los datos de la
   * experiencia: consultar disponibilidad no debe crear nada en la base.
   */
  private async sessionForPreview(dto: {
    sessionId?: string;
    experienceId?: string;
    date?: string;
    startTime?: string;
    shiftKey?: string;
  }): Promise<{
    startAt: Date;
    durationMinutes: number;
    capacity: number;
    seatsTaken: number;
    price?: number;
    depositPct?: number;
    experienceId?: Types.ObjectId | string;
  }> {
    if (dto.sessionId) {
      if (!Types.ObjectId.isValid(dto.sessionId)) {
        throw new BadRequestException('sessionId inválido');
      }
      const found = await this.sessionModel.findById(dto.sessionId).lean();
      if (!found || found.deletedAt) {
        throw new NotFoundException('Turno no encontrado');
      }
      return found;
    }

    // `startTime` ('HH:mm') es el camino nuevo; `shiftKey` ('T1') se sigue
    // aceptando y se traduce al inicio del turno sugerido.
    const time = dto.startTime ?? dto.shiftKey;
    if (!dto.experienceId || !dto.date || !time) {
      throw new BadRequestException(
        'Indicá el horario: experienceId + date + startTime (o un sessionId).',
      );
    }

    const slot = await this.availability.slotOrThrow(
      dto.experienceId,
      dto.date,
      time,
    );
    const existing = await this.sessionModel
      .findOne({
        experienceId: new Types.ObjectId(dto.experienceId),
        dateKey: dto.date,
        startKey: slot.startKey,
        deletedAt: { $exists: false },
      })
      .lean();

    const exp = await this.experienceModel
      .findById(dto.experienceId)
      .select('basePrice depositPct')
      .lean();

    return {
      startAt: slot.startAt,
      durationMinutes: slot.durationMinutes,
      capacity: existing?.capacity ?? slot.capacity,
      seatsTaken: existing?.seatsTaken ?? 0,
      price: existing?.price ?? exp?.basePrice,
      depositPct: existing?.depositPct ?? exp?.depositPct ?? 50,
      experienceId: dto.experienceId,
    };
  }

  /**
   * De dónde sale el turno de un hold: o un `sessionId` explícito (turno que el
   * admin cargó a mano), o el trío (experiencia, día, bloque), en cuyo caso el
   * turno se crea solo la primera vez que alguien reserva ahí.
   */
  private async resolveSessionId(dto: {
    sessionId?: string;
    experienceId?: string;
    date?: string;
    startTime?: string;
    shiftKey?: string;
  }): Promise<string> {
    if (dto.sessionId) return dto.sessionId;
    const time = dto.startTime ?? dto.shiftKey;
    if (!dto.experienceId || !dto.date || !time) {
      throw new BadRequestException(
        'Indicá el horario: experienceId + date + startTime (o un sessionId).',
      );
    }
    const session = await this.availability.ensureSession(
      dto.experienceId,
      dto.date,
      time,
    );
    return String(session._id);
  }

  /**
   * ¿Entra un grupo de `qty` en el turno? No reserva nada: es lo que el bot
   * consulta antes de ofrecer. Distingue los tres desenlaces que le importan al
   * cliente: entra normal, entra sólo compartiendo mesa grande (hay que
   * preguntarle), o no entra.
   */
  async previewTables(dto: {
    sessionId?: string;
    experienceId?: string;
    date?: string;
    startTime?: string;
    shiftKey?: string;
    quantity: number;
    acceptSharedTable?: boolean;
    isBirthday?: boolean;
  }) {
    const qty = dto.quantity;
    const acceptShared = dto.acceptSharedTable ?? false;

    // Igual que el hold: por turno existente o por (experiencia, día, hora).
    // Acá NO se crea nada: sólo se calcula dónde caería.
    const session = await this.sessionForPreview(dto);

    const [preview, remaining, venueMax] = await Promise.all([
      this.tables.previewAssignment({
        qty,
        startAt: session.startAt,
        durationMinutes: session.durationMinutes,
        sharedAccepted: acceptShared,
      }),
      this.tables.remainingPartySize(
        session.startAt,
        session.durationMinutes,
      ),
      this.tables.venueMaxParty(),
    ]);

    const seatsLeftInSession = Math.max(
      0,
      (session.capacity ?? 0) - (session.seatsTaken ?? 0),
    );

    if (preview.fits) {
      // Montos calculados ACÁ (con tiers por cantidad incluidos) para que el
      // bot y la landing muestren el mismo número que después se cobra.
      let pricing:
        | {
            unitPrice: number;
            totalAmount: number;
            depositAmount: number;
            balanceDue: number;
            variantName?: string;
            variantDescription?: string;
            /** Lugares bonificados por la promo (entran pero no se cobran). */
            freeSpots?: number;
          }
        | undefined;
      if (session.price != null) {
        const variants = await this.variantsFor(
          session.experienceId,
          dto.isBirthday,
        );
        const eff = effectiveUnitPrice(
          variants,
          session.price,
          qty,
          businessDateKey(session.startAt),
        );
        const amounts = computeReservationAmounts(
          eff.unitPrice,
          eff.billableQty,
          session.depositPct ?? 50,
        );
        pricing = {
          unitPrice: eff.unitPrice,
          totalAmount: amounts.total,
          depositAmount: amounts.deposit,
          balanceDue: amounts.balanceDue,
          variantName: eff.variant?.name,
          variantDescription: eff.variant?.description,
          freeSpots:
            eff.billableQty < qty ? qty - eff.billableQty : undefined,
        };
      }
      return {
        fits: true,
        // Etiqueta del turno sugerido en el que cae el horario (informativa;
        // el bot viejo la sigue leyendo como shiftKey).
        shiftKey: preview.suggestedShiftKey,
        tables: preview.plan.tables.map((t) => t.code),
        sharedTable: preview.plan.shared,
        maxPartySize: Math.min(remaining, seatsLeftInSession),
        pricing,
      };
    }

    return {
      fits: false,
      reason: preview.reason,
      /** true ⇒ hay lugar, pero sólo compartiendo mesa grande con otro grupo. */
      needsSharedConsent: preview.reason === 'NEEDS_SHARED_CONSENT',
      sharedOffer: preview.offer?.tables.map((t) => t.code),
      maxPartySize: Math.min(remaining, seatsLeftInSession),
      /** Tope físico del salón, para distinguir "hoy no entra" de "nunca entra". */
      venueMaxPartySize: venueMax,
    };
  }

  // ───────────────────── Transferencia (interno del bot) ─────────────────────

  /**
   * Último hold PENDING por TRANSFERENCIA (no vencido) del teléfono. El bot lo
   * usa para asociar un comprobante que llega por WhatsApp con su reserva.
   * Matcheo por sufijo de dígitos (el número puede venir con o sin 549/9).
   */
  async pendingTransferByPhone(phone: string) {
    const digits = (phone || '').replace(/\D/g, '');
    if (digits.length < 6) return { found: false };
    const candidates = await this.reservationModel
      .find({
        status: ReservationStatus.PENDING,
        paymentMethod: ReservationPaymentMethod.TRANSFER,
        expiresAt: { $gt: new Date() },
        deletedAt: { $exists: false },
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const suffix = digits.slice(-10);
    const match = candidates.find((r) =>
      (r.customerPhone || '').replace(/\D/g, '').endsWith(suffix),
    );
    if (!match) return { found: false };
    return {
      found: true,
      reservation: {
        reservationId: String(match._id),
        code: match.code,
        experienceName: match.experienceName,
        startAt: match.startAt,
        quantity: match.quantity,
        depositAmount: match.depositAmount,
        totalAmount: match.totalAmount,
        balanceDue: match.balanceDue,
        expiresAt: match.expiresAt,
      },
    };
  }

  /**
   * Resuelve el comprobante de transferencia de un hold TRANSFER (lo llama el
   * bot tras validar la imagen con IA). approved=true ⇒ CONFIRMED + venta;
   * approved=false ⇒ NEEDS_REVIEW (libera cupo; el admin re-toma al confirmar).
   * La nota queda en la reserva para la auditoría humana de fin de día.
   */
  async resolveTransferProof(id: string, dto: TransferProofDto) {
    const r = await this.findByIdOrThrow(id);
    if (r.paymentMethod !== ReservationPaymentMethod.TRANSFER) {
      throw new ConflictException('La reserva no es por transferencia.');
    }
    if (r.status !== ReservationStatus.PENDING) {
      throw new ConflictException('La reserva ya no está pendiente.');
    }

    const stamp = new Date();
    const noteLine =
      `[comprobante ${stamp.toISOString()}] ` +
      `${dto.approved ? 'OK' : 'A REVISAR'}` +
      `${dto.amountDetected != null ? ` · monto detectado $${dto.amountDetected}` : ''}` +
      `${dto.note ? ` · ${dto.note}` : ''}`;
    const notes = [r.notes, noteLine].filter(Boolean).join('\n');

    const won = await this.reservationModel.findOneAndUpdate(
      { _id: r._id, status: ReservationStatus.PENDING },
      {
        $set: dto.approved
          ? {
              status: ReservationStatus.CONFIRMED,
              confirmedAt: stamp,
              notes,
            }
          : { status: ReservationStatus.NEEDS_REVIEW, notes },
      },
      { new: true },
    );
    if (!won) {
      // Carrera con el cron de expiración: ya no estaba PENDING.
      throw new ConflictException('La reserva ya no está pendiente.');
    }

    if (dto.approved) {
      await this.createSaleForReservation(won, PaymentMethod.TRANSFER);
    } else {
      // Igual que el flujo de revisión existente: el cupo se libera y
      // adminResolveReview lo re-toma si el admin confirma.
      await this.tables.release(won._id as Types.ObjectId, won.startAt);
      await this.releaseSeats(won.sessionId, won.quantity);
    }
    return this.publicView(won);
  }

  /** Estado de una reserva por id (para polling del front). */
  async getStatus(id: string) {
    const r = await this.findByIdOrThrow(id);
    return this.lookupView(r);
  }

  /** Búsqueda pública por código de gestión. */
  async getByCode(code: string, opts: { includePhone?: boolean } = {}) {
    const r = await this.reservationModel
      .findOne({
        code: code.trim().toUpperCase(),
        deletedAt: { $exists: false },
      })
      .exec();
    if (!r) throw new NotFoundException('Reserva no encontrada');
    return this.lookupView(r, opts);
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
      return this.lookupView(r);
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
    if (!won) return this.lookupView(await this.findByIdOrThrow(String(r._id)));

    await this.tables.release(won._id as Types.ObjectId, won.startAt);
    await this.releaseSeats(won.sessionId, won.quantity);

    if (
      wasConfirmed &&
      won.paymentMethod === ReservationPaymentMethod.MERCADOPAGO
    ) {
      await this.refundReservation(won);
    }
    return this.lookupView(won);
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
      // Pago llegó tarde. Intentamos re-tomar cupo y mesas.
      try {
        const session = await this.reserveSeats(
          String(r.sessionId),
          r.quantity,
          [SessionStatus.OPEN, SessionStatus.CLOSED],
        );
        try {
          await this.attachTables(r, session);
        } catch (err) {
          await this.releaseSeats(session._id as Types.ObjectId, r.quantity);
          throw err;
        }
        r.status = ReservationStatus.CONFIRMED;
        r.confirmedAt = now;
        await r.save();
        this.logger.log(`Reserva ${reservationId} re-tomada tras pago tardío`);
        await this.createSaleForReservation(r, PaymentMethod.MERCADOPAGO);
      } catch {
        // Sin cupo o sin mesas: marcar para revisión y reembolsar.
        r.status = ReservationStatus.NEEDS_REVIEW;
        await r.save();
        this.logger.warn(
          `Reserva ${reservationId}: pago tardío sin lugar ⇒ NEEDS_REVIEW + refund`,
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
        await this.tables.release(won._id as Types.ObjectId, won.startAt);
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
    const sessionId = await this.resolveSessionId(dto);
    const session = await this.reserveSeats(sessionId, qty, [
      SessionStatus.OPEN,
      SessionStatus.CLOSED,
      SessionStatus.DRAFT,
    ]);

    const { unitPrice, billableQty } = await this.effectivePriceFor(
      session.experienceId,
      session.price,
      qty,
      session.startAt,
      dto.isBirthday,
    );
    const total = unitPrice * billableQty;
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
        dietaryTags: dto.dietaryTags ?? [],
        dietaryNotes: dto.dietaryNotes,
        isBirthday: dto.isBirthday ?? false,
        notes: dto.notes,
        createdById: userId,
        confirmedAt: new Date(),
      });
    } catch (err) {
      await this.releaseSeats(session._id as Types.ObjectId, qty);
      throw err;
    }

    // Mesas. El admin ve el salón y decide, así que puede forzar la mesa
    // compartida sin el ida y vuelta que hace el bot con el cliente.
    try {
      await this.attachTables(reservation, session, true);
    } catch (err) {
      reservation.status = ReservationStatus.CANCELLED;
      reservation.cancelledAt = new Date();
      await reservation.save();
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

  /**
   * ¿Esta cuenta puede ver los datos personales y la plata de las reservas?
   * Los admin y las cuentas con la vista Reservas completa sí; una cuenta con
   * sólo alguna pestaña suelta (p. ej. cocina, con 'reservas:agenda') ve los
   * turnos, la cantidad de personas y las restricciones, nada más.
   */
  private canSeeReservationDetails(actor?: Actor): boolean {
    if (actor?.role === UserRole.ADMIN) return true;
    const views = actor?.allowedViews ?? [];
    return views.length === 0 || views.includes('reservas');
  }

  /**
   * Reserva vista por cocina/taller: sólo lo necesario para organizar el día.
   * Lista blanca a propósito — muestra el nombre de quien reserva (para saber
   * quién viene) pero NO el contacto, los importes ni el código de gestión
   * (con ese código se puede cancelar la reserva desde la web).
   */
  private redactReservation(r: Record<string, any>): Record<string, any> {
    return {
      _id: r._id,
      status: r.status,
      sessionId: r.sessionId,
      experienceId: r.experienceId,
      experienceName: r.experienceName,
      customerName: r.customerName,
      startAt: r.startAt,
      quantity: r.quantity,
      dietaryTags: r.dietaryTags ?? [],
      dietaryNotes: r.dietaryNotes,
      isBirthday: r.isBirthday ?? false,
      shiftKey: r.shiftKey,
      tableCodes: r.tableCodes ?? [],
      sharedTable: r.sharedTable ?? false,
    };
  }

  /** Listado paginado para el admin (con filtros). */
  async list(query: ListReservationsQueryDto, actor?: Actor) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (query.status) filter.status = query.status;
    if (query.sessionId) filter.sessionId = new Types.ObjectId(query.sessionId);
    if (query.experienceId)
      filter.experienceId = new Types.ObjectId(query.experienceId);
    if (query.date) {
      const start = DateTime.fromISO(query.date, {
        zone: envConfig.timezone,
      }).startOf('day');
      filter.startAt = {
        $gte: start.toJSDate(),
        $lt: start.plus({ days: 1 }).toJSDate(),
      };
    }

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
      items: this.canSeeReservationDetails(actor)
        ? items
        : items.map((r) => this.redactReservation(r as Record<string, any>)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /** Anotados de un turno (para "ver los anotados"). */
  async listBySession(sessionId: string, actor?: Actor) {
    if (!Types.ObjectId.isValid(sessionId))
      throw new BadRequestException('sessionId inválido');
    const items = await this.reservationModel
      .find({
        sessionId: new Types.ObjectId(sessionId),
        status: {
          $in: [ReservationStatus.CONFIRMED, ReservationStatus.PENDING],
        },
        deletedAt: { $exists: false },
      })
      .sort({ createdAt: 1 })
      .lean();
    // Una cuenta con la Agenda recortada (cocina/tutores, sólo 'reservas:agenda')
    // ve nombre, cantidad, actividad y restricciones, pero no contacto ni
    // importes. El admin y quien tenga la vista Reservas completa ven todo.
    return this.canSeeReservationDetails(actor)
      ? items
      : items.map((r) => this.redactReservation(r as Record<string, any>));
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

  /**
   * Asigna las mesas del turno a una reserva ya creada y las guarda en ella.
   * La asignación es atómica sobre el documento del día: o entran todas las
   * mesas que el grupo necesita, o no entra ninguna.
   */
  private async attachTables(
    reservation: ReservationDocument,
    session: ExperienceSessionDocument,
    sharedAccepted?: boolean,
  ): Promise<void> {
    const assignment = await this.tables.assign({
      reservationId: reservation._id as Types.ObjectId,
      qty: reservation.quantity,
      startAt: session.startAt,
      durationMinutes: session.durationMinutes,
      sharedAccepted,
    });
    reservation.tableCodes = assignment.tables.map((t) => t.code);
    reservation.sharedTable = assignment.shared;
    if (assignment.shared) reservation.sharedConsentAt = new Date();
    await reservation.save();
  }

  /** Mensaje al cliente según por qué no entró el grupo en las mesas. */
  private tableError(reason: string): Error {
    if (reason === 'NEEDS_SHARED_CONSENT') {
      return new ConflictException(
        'Para ese horario no quedan mesas individuales. Podemos ofrecer un lugar en una mesa grande compartida con otro grupo: hay que aceptarlo expresamente para continuar.',
      );
    }
    if (reason === 'INVALID_QTY') {
      return new BadRequestException('La cantidad de personas no es válida.');
    }
    return new ConflictException(
      'No quedan mesas para ese grupo en ese horario. Elegí otro turno u otra fecha.',
    );
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

  /**
   * Agradecimiento post-experiencia: el día DESPUÉS del turno, un mensaje cálido
   * (seguimiento). Idempotente vía thankedAt. Ventana: turnos terminados entre
   * ~6 h y ~48 h atrás (evita mandarlo apenas termina y no revive reservas viejas).
   */
  async sendPostExperienceThanks(): Promise<number> {
    const now = new Date();
    const from = new Date(now.getTime() - 48 * 3600_000);
    const to = new Date(now.getTime() - 6 * 3600_000);
    const due = await this.reservationModel
      .find({
        status: ReservationStatus.CONFIRMED,
        startAt: { $gte: from, $lte: to },
        thankedAt: { $exists: false },
        deletedAt: { $exists: false },
      })
      .limit(100)
      .exec();
    let sent = 0;
    for (const r of due) {
      if (r.customerPhone) {
        const name = r.customerName ? ` ${r.customerName.split(' ')[0]}` : '';
        const ok = await this.notifications.notify(
          r.customerPhone,
          `¡Hola${name}! ¿Cómo la pasaste en Mística? 🎨\n\n` +
            `Ojalá te hayas llevado un lindo recuerdo. Cuando quieras volver a ` +
            `crear, escribinos y lo vemos juntos 💛`,
        );
        if (ok) sent++;
      }
      r.thankedAt = now;
      await r.save();
    }
    if (sent)
      this.logger.log(`Agradecimientos post-experiencia enviados: ${sent}`);
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
      {
        $set: { status: ReservationStatus.CANCELLED, cancelledAt: new Date() },
      },
      { new: true },
    );
    if (!won) return this.publicView(await this.findByIdOrThrow(id));
    await this.tables.release(won._id as Types.ObjectId, won.startAt);
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
    // confirm: re-tomar cupo y mesas, y registrar venta.
    const session = await this.reserveSeats(String(r.sessionId), r.quantity, [
      SessionStatus.OPEN,
      SessionStatus.CLOSED,
    ]);
    try {
      await this.attachTables(r, session);
    } catch (err) {
      await this.releaseSeats(session._id as Types.ObjectId, r.quantity);
      throw err;
    }
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

  /**
   * Reprograma una reserva CONFIRMED a otro turno. Política: las modificaciones
   * se aceptan hasta RESCHEDULE_MIN_HOURS (48 h) antes del turno original;
   * `force` permite al admin saltear la regla. El precio del nuevo turno debe
   * coincidir (la seña/venta ya registradas no se recalculan). Toma cupo en el
   * turno nuevo antes de liberar el viejo (compensación, sin transacciones).
   */
  async adminReschedule(id: string, dto: AdminRescheduleReservationDto) {
    const r = await this.findByIdOrThrow(id);
    if (r.status !== ReservationStatus.CONFIRMED) {
      throw new ConflictException(
        'Sólo se pueden reprogramar reservas confirmadas.',
      );
    }
    // La política se chequea ANTES de resolver el turno destino: si la
    // reprogramación no se acepta, no queremos haber creado un turno al pedo.
    const now = new Date();
    const limit = new Date(
      r.startAt.getTime() - RESCHEDULE_MIN_HOURS * 3600_000,
    );
    if (now > limit && !dto.force) {
      throw new ConflictException(
        `Las modificaciones se aceptan hasta ${RESCHEDULE_MIN_HOURS} h antes del turno.`,
      );
    }

    const targetSessionId = await this.resolveSessionId(dto);
    if (String(r.sessionId) === targetSessionId) {
      throw new BadRequestException('La reserva ya está en ese turno.');
    }

    // Toma cupo en el turno nuevo (atómico). Igual que adminCreate, el admin
    // puede anotar también en turnos CLOSED/DRAFT.
    const target = await this.reserveSeats(targetSessionId, r.quantity, [
      SessionStatus.OPEN,
      SessionStatus.CLOSED,
      SessionStatus.DRAFT,
    ]);

    if (target.price !== r.unitPrice) {
      await this.releaseSeats(target._id as Types.ObjectId, r.quantity);
      throw new ConflictException(
        'El nuevo turno tiene otro precio. Cancelá la reserva y creá una nueva.',
      );
    }

    const oldSessionId = r.sessionId;
    const oldStartAt = r.startAt;

    // Mesas: si el horario nuevo es exactamente el mismo (misma fecha y hora
    // de inicio), las mesas ya asignadas siguen sirviendo y no se tocan. Si
    // cambia, se toman las nuevas ANTES de soltar las viejas. Los slots llevan
    // startAt, así que la liberación selectiva es por horario exacto.
    const sameSlot = oldStartAt.getTime() === target.startAt.getTime();

    if (!sameSlot) {
      try {
        await this.attachTables(r, target, true);
      } catch (err) {
        await this.releaseSeats(target._id as Types.ObjectId, r.quantity);
        throw err;
      }
    }

    try {
      r.sessionId = target._id as Types.ObjectId;
      r.experienceId = target.experienceId;
      r.experienceName = target.experienceName;
      r.startAt = target.startAt;
      r.rescheduledAt = now;
      // Re-armar el recordatorio para la nueva fecha.
      r.set('reminderSentAt', undefined);
      r.updatedAt = now;
      await r.save();
    } catch (err) {
      if (!sameSlot) {
        await this.tables.release(
          r._id as Types.ObjectId,
          target.startAt,
          target.startAt,
        );
      }
      await this.releaseSeats(target._id as Types.ObjectId, r.quantity);
      throw err;
    }
    if (!sameSlot) {
      await this.tables.release(
        r._id as Types.ObjectId,
        oldStartAt,
        oldStartAt,
      );
    }
    await this.releaseSeats(oldSessionId, r.quantity);

    if (r.customerPhone) {
      await this.notifications.notify(
        r.customerPhone,
        `Tu reserva fue reprogramada ✨\n\n*${r.experienceName}*\n` +
          `Nuevo turno: ${this.fmtWhen(r.startAt)}\n(antes: ${this.fmtWhen(oldStartAt)})\n` +
          `Código: *${r.code}*\n\n¡Te esperamos! 💛`,
      );
    }
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

  /**
   * Variantes de precio que rigen para una reserva. Normalmente las de la
   * experiencia reservada; si la reserva es un CUMPLEAÑOS, las del doc
   * Cumpleaños (isBirthday=true): sus beneficios — en general sin precio
   * propio — se aplican sobre el precio de la experiencia elegida, y las
   * variantes propias de la experiencia NO participan (una sola fuente de
   * promos por reserva, predecible para el equipo).
   */
  private async variantsFor(
    experienceId: Types.ObjectId | string | undefined,
    isBirthday?: boolean,
  ) {
    if (isBirthday) {
      const bday = await this.experienceModel
        .findOne({ isBirthday: true, deletedAt: { $exists: false } })
        .select('priceVariants')
        .lean();
      return bday?.priceVariants ?? [];
    }
    if (!experienceId) return [];
    const exp = await this.experienceModel
      .findById(experienceId)
      .select('priceVariants')
      .lean();
    return exp?.priceVariants ?? [];
  }

  /**
   * Precio a cobrar: el del turno, salvo que una PROMO aplique a esta
   * reserva — tier por cantidad, promo por día de semana o por fecha (ver
   * common/pricing y variantsFor para el caso cumpleaños). Devuelve también
   * billableQty: la promo puede bonificar lugares ("1 lugar bonificado") y
   * entonces se cobran menos personas de las que entran. Best-effort: si la
   * experiencia no aparece, vale el precio del turno sin promo.
   */
  private async effectivePriceFor(
    experienceId: Types.ObjectId | string | undefined,
    sessionPrice: number,
    qty: number,
    startAt: Date,
    isBirthday?: boolean,
  ): Promise<{ unitPrice: number; billableQty: number }> {
    const variants = await this.variantsFor(experienceId, isBirthday);
    if (!variants.length) return { unitPrice: sessionPrice, billableQty: qty };
    const eff = effectiveUnitPrice(
      variants,
      sessionPrice,
      qty,
      businessDateKey(startAt),
    );
    return { unitPrice: eff.unitPrice, billableQty: eff.billableQty };
  }

  private async findByIdOrThrow(id: string): Promise<ReservationDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const r = await this.reservationModel.findById(id).exec();
    if (!r || r.deletedAt) throw new NotFoundException('Reserva no encontrada');
    return r;
  }

  /**
   * Respuesta del hold público. El cliente paga la seña SIEMPRE por
   * transferencia y manda el comprobante por WhatsApp, así que devolvemos los
   * datos bancarios y el número al que escribir (la landing los muestra tal
   * cual). `holdMinutes` es lo que dura el lugar apartado.
   */
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
      paymentMethod: r.paymentMethod,
      holdMinutes: TRANSFER_HOLD_MINUTES,
      transfer: {
        alias: envConfig.transfer.alias,
        ownerName: envConfig.transfer.ownerName,
        bank: envConfig.transfer.bank,
      },
      whatsapp: envConfig.businessWhatsapp,
    };
  }

  /**
   * Vista de los endpoints PÚBLICOS sin autenticación (estado por id, búsqueda
   * y cancelación por código). No lleva datos personales: el código y el id se
   * pueden adivinar, así que acertar uno no tiene que exponer nombre, email,
   * teléfono ni notas. El bot (con X-Bot-Secret) recibe además el teléfono
   * para verificar que la reserva sea del número que escribe.
   */
  private lookupView(
    r: ReservationDocument,
    opts: { includePhone?: boolean } = {},
  ) {
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
      expiresAt: r.expiresAt,
      confirmedAt: r.confirmedAt,
      cancelledAt: r.cancelledAt,
      ...(opts.includePhone ? { customerPhone: r.customerPhone } : {}),
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
      // Las restricciones viajan en TODAS las vistas de la reserva: el equipo
      // no se tiene que enterar el día que la persona llega.
      dietaryTags: r.dietaryTags ?? [],
      dietaryNotes: r.dietaryNotes,
      isBirthday: r.isBirthday ?? false,
      shiftKey: r.shiftKey,
      tableCodes: r.tableCodes ?? [],
      sharedTable: r.sharedTable ?? false,
      notes: r.notes,
      createdAt: r.createdAt,
    };
  }
}
