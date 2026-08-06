import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import { envConfig } from '../config/env.config';
import { SessionStatus } from '../common/enums';
import {
  Experience,
  ExperienceDocument,
} from '../common/schemas/experience.schema';
import {
  ExperienceSession,
  ExperienceSessionDocument,
} from '../common/schemas/experience-session.schema';
import { ClosedDatesService } from '../closed-dates/closed-dates.service';
import { TablesService } from '../tables/tables.service';
import { ShiftsService } from '../tables/shifts.service';
import {
  bookingStartWindow,
  checkBookingWindow,
  shiftAllowsExperience,
  startWindow,
} from '../tables/shifts';

/** Error de clave duplicada de MongoDB. */
const DUP_KEY = 11000;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Un horario sugerido reservable de un día concreto. */
export interface AvailableShift {
  dateKey: string;
  /** Hora local de inicio de la actividad, 'HH:mm'. Es la clave del horario. */
  startTime: string;
  /** Turno sugerido en el que cae (etiqueta, puede no haber). */
  shiftKey?: string;
  shiftName?: string;
  /** Inicio y fin reales de la experiencia. */
  startAt: Date;
  endAt: Date;
  /** Grupo más grande que todavía entra (0 = sin lugar). */
  maxPartySize: number;
  price: number;
  depositPct: number;
}

/**
 * Disponibilidad por DÍA y HORARIO, sin turnos precargados.
 *
 * Los turnos sugeridos (ShiftTemplate) ordenan la oferta: la landing y el bot
 * ofrecen primero el inicio de cada turno. Pero el horario es LIBRE: cualquier
 * hora que empiece después de la apertura y termine antes del cierre vale. El
 * `ExperienceSession` concreto se crea solo la primera vez que alguien reserva
 * ese (experiencia, día, hora de inicio).
 */
@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    @InjectModel(Experience.name)
    private readonly experienceModel: Model<ExperienceDocument>,
    @InjectModel(ExperienceSession.name)
    private readonly sessionModel: Model<ExperienceSessionDocument>,
    private readonly shifts: ShiftsService,
    private readonly tables: TablesService,
    private readonly closedDates: ClosedDatesService,
  ) {}

  /**
   * Días y horarios sugeridos donde se puede reservar una experiencia, entre
   * dos fechas. Ofrece el inicio de cada turno sugerido del día (el cliente
   * puede pedir otra hora: se valida con el preview). Salta los días cerrados.
   * `includeFull` deja pasar los que ya no tienen lugar (para mostrarlos
   * agotados en vez de esconderlos).
   */
  async forExperience(params: {
    experienceId: string;
    from?: string;
    to?: string;
    days?: number;
    includeFull?: boolean;
  }): Promise<AvailableShift[]> {
    const exp = await this.experienceOrThrow(params.experienceId);
    const tz = envConfig.timezone;

    const start = params.from
      ? DateTime.fromISO(params.from, { zone: tz })
      : DateTime.now().setZone(tz);
    if (!start.isValid) throw new BadRequestException('from inválido');
    // Hasta 6 meses de anticipación: el cliente puede reservar bien a futuro.
    const end = params.to
      ? DateTime.fromISO(params.to, { zone: tz })
      : start.plus({ days: Math.min(params.days ?? 30, 180) });
    if (!end.isValid) throw new BadRequestException('to inválido');
    const horizon = DateTime.now().setZone(tz).plus({ days: 180 });
    const cappedEnd = end > horizon ? horizon : end;

    const now = DateTime.now().setZone(tz);

    // Días del rango, con el chequeo de cerrado EN PARALELO: el rango típico
    // son 14–30 días y hacerlo secuencial suma latencia al pedo.
    const days: DateTime[] = [];
    for (
      let d = start.startOf('day');
      d <= cappedEnd.startOf('day');
      d = d.plus({ days: 1 })
    ) {
      days.push(d);
    }
    const closedFlags = await Promise.all(
      days.map((d) => this.closedDates.isClosed(d.toJSDate())),
    );

    // Candidatos (día abierto × turno sugerido) armados en orden cronológico.
    const candidates: Array<{
      slot: Omit<AvailableShift, 'maxPartySize' | 'shiftKey' | 'shiftName'>;
      shiftKey: string;
      shiftName: string;
    }> = [];
    days.forEach((d, i) => {
      if (closedFlags[i].closed) return;
      const dateKey = d.toISODate() as string;
      for (const shift of this.shifts.forDate(dateKey)) {
        if (!shiftAllowsExperience(shift, String(exp._id))) continue;
        // El horario sugerido es el inicio del turno; si la experiencia no
        // entra en el turno pero sí en la ventana del día, se sugiere igual
        // (el turno es una guía, no un límite).
        if (!startWindow(shift, exp.durationMinutes)) continue;

        const slot = this.slotAt(exp, dateKey, shift.start, tz);
        if (!slot) continue; // fuera de la ventana del negocio
        // No ofrecemos horarios que ya empezaron.
        if (DateTime.fromJSDate(slot.startAt) <= now) continue;
        candidates.push({ slot, shiftKey: shift.key, shiftName: shift.name });
      }
    });

    // Tope real de cada horario: lo que permiten las mesas libres, acotado por
    // el cupo nominal de la experiencia. Tiene que dar lo MISMO que el preview
    // del hold, o la web ofrece un grupo que después se rechaza. Todo en
    // paralelo: son lecturas independientes por (día, hora).
    const enriched = await Promise.all(
      candidates.map(async ({ slot, shiftKey, shiftName }) => {
        const [free, taken] = await Promise.all([
          this.tables.remainingPartySize(slot.startAt, exp.durationMinutes),
          this.seatsTakenIn(exp, slot.dateKey, slot.startTime),
        ]);
        const maxPartySize = Math.min(
          free,
          Math.max(0, exp.defaultCapacity - taken),
        );
        return { ...slot, shiftKey, shiftName, maxPartySize };
      }),
    );

    return enriched.filter((s) => s.maxPartySize > 0 || params.includeFull);
  }

  /** Anotados que ya tiene esa experiencia en ese horario (0 si no hay turno). */
  private async seatsTakenIn(
    exp: ExperienceDocument,
    dateKey: string,
    startKey: string,
  ): Promise<number> {
    const existing = await this.sessionModel
      .findOne({
        experienceId: exp._id as Types.ObjectId,
        dateKey,
        startKey,
        deletedAt: { $exists: false },
      })
      .select('seatsTaken')
      .lean();
    return existing?.seatsTaken ?? 0;
  }

  /**
   * Hora local de inicio a partir de lo que mande el cliente: una hora
   * 'HH:mm' directa, o la clave de un turno sugerido ('T1') que se traduce a
   * su hora de inicio (compatibilidad con el bot y la landing viejos).
   */
  resolveStartTime(dateKey: string, timeOrShift: string): string {
    const raw = timeOrShift.trim();
    if (HHMM.test(raw)) return raw;
    const shift = this.shifts
      .forDate(dateKey)
      .find((s) => s.key === raw.toUpperCase());
    if (shift) return shift.start;
    throw new BadRequestException(
      `"${timeOrShift}" no es una hora válida (HH:mm) ni un turno del día.`,
    );
  }

  /**
   * Dónde caería una experiencia en (día, hora), SIN crear nada. Lo usa la
   * consulta de disponibilidad: preguntar no debe escribir en la base.
   */
  async slotOrThrow(
    experienceId: string,
    dateKey: string,
    timeOrShift: string,
  ): Promise<{
    startAt: Date;
    startKey: string;
    durationMinutes: number;
    capacity: number;
  }> {
    const exp = await this.experienceOrThrow(experienceId);
    const startTime = this.resolveStartTime(dateKey, timeOrShift);
    const slot = this.slotAt(exp, dateKey, startTime, envConfig.timezone);
    if (!slot) {
      const w = bookingStartWindow(exp.durationMinutes);
      throw new BadRequestException(
        w
          ? `${exp.name} dura ${exp.durationMinutes} min: ese día se puede reservar entre las ${w.earliest} y las ${w.latest}.`
          : `${exp.name} dura ${exp.durationMinutes} min y no entra en el horario del salón.`,
      );
    }
    return {
      startAt: slot.startAt,
      startKey: slot.startTime,
      durationMinutes: exp.durationMinutes,
      capacity: exp.defaultCapacity,
    };
  }

  /**
   * Turno concreto para (experiencia, día, hora), creándolo si no existe.
   * Idempotente: el índice único (experienceId, dateKey, startKey) hace que
   * dos reservas simultáneas terminen sobre el MISMO turno en vez de
   * duplicarlo.
   */
  async ensureSession(
    experienceId: string,
    dateKey: string,
    timeOrShift: string,
  ): Promise<ExperienceSessionDocument> {
    const exp = await this.experienceOrThrow(experienceId);
    const tz = envConfig.timezone;
    const startTime = this.resolveStartTime(dateKey, timeOrShift);

    const slot = this.slotAt(exp, dateKey, startTime, tz);
    if (!slot) {
      const w = bookingStartWindow(exp.durationMinutes);
      throw new BadRequestException(
        w
          ? `${exp.name} dura ${exp.durationMinutes} min: ese día se puede reservar entre las ${w.earliest} y las ${w.latest}.`
          : `${exp.name} dura ${exp.durationMinutes} min y no entra en el horario del salón.`,
      );
    }

    const closed = await this.closedDates.isClosed(slot.startAt);
    if (closed.closed) {
      throw new BadRequestException(
        `Ese día el local no abre${closed.reason ? ` (${closed.reason})` : ''}. Elegí otra fecha.`,
      );
    }

    const filter = {
      experienceId: exp._id as Types.ObjectId,
      dateKey,
      startKey: slot.startTime,
    };

    const existing = await this.sessionModel.findOne(filter).exec();
    if (existing) {
      if (existing.deletedAt || existing.status === SessionStatus.CANCELLED) {
        throw new ConflictException(
          'Ese horario fue dado de baja por el equipo. Elegí otro.',
        );
      }
      return existing;
    }

    try {
      return await this.sessionModel.create({
        ...filter,
        experienceName: exp.name,
        durationMinutes: exp.durationMinutes,
        price: exp.basePrice,
        depositPct: exp.depositPct ?? 50,
        startAt: slot.startAt,
        endAt: slot.endAt,
        // El cupo real lo ponen las mesas del salón; este número es sólo el
        // techo nominal del turno para el panel.
        capacity: exp.defaultCapacity,
        seatsTaken: 0,
        venueSeats: 0,
        status: SessionStatus.OPEN,
      });
    } catch (err) {
      // Carrera: otra reserva creó el mismo turno un instante antes.
      if ((err as { code?: number })?.code === DUP_KEY) {
        const winner = await this.sessionModel.findOne(filter).exec();
        if (winner) return winner;
      }
      throw err;
    }
  }

  // ───────────────────────── helpers ─────────────────────────

  /**
   * Ubica la experiencia arrancando a `startTime` ('HH:mm') dentro de la
   * ventana del negocio. Devuelve null si empieza antes de abrir o termina
   * después de cerrar. Los turnos sugeridos NO restringen acá.
   */
  private slotAt(
    exp: ExperienceDocument,
    dateKey: string,
    startTime: string,
    tz: string,
  ): Omit<AvailableShift, 'maxPartySize' | 'shiftKey' | 'shiftName'> | null {
    const startAt = DateTime.fromISO(`${dateKey}T${startTime}`, { zone: tz });
    if (!startAt.isValid) return null;

    const checked = checkBookingWindow(
      startAt.toJSDate(),
      exp.durationMinutes,
      tz,
    );
    if (!checked.ok) return null;

    return {
      dateKey,
      startTime,
      startAt: startAt.toJSDate(),
      endAt: startAt.plus({ minutes: exp.durationMinutes }).toJSDate(),
      price: exp.basePrice,
      depositPct: exp.depositPct ?? 50,
    };
  }

  private async experienceOrThrow(id: string): Promise<ExperienceDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('experienceId inválido');
    const exp = await this.experienceModel.findById(id).exec();
    if (!exp || exp.deletedAt || !exp.isActive) {
      throw new NotFoundException('Experiencia no encontrada');
    }
    if (exp.bookableOnline === false) {
      throw new BadRequestException(
        `${exp.name} no se reserva online: se coordina con el equipo.`,
      );
    }
    return exp;
  }
}
