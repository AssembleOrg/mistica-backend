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
import { ShiftDef, shiftAllowsExperience, startWindow } from '../tables/shifts';

/** Error de clave duplicada de MongoDB. */
const DUP_KEY = 11000;

/** Un bloque reservable de un día concreto. */
export interface AvailableShift {
  dateKey: string;
  shiftKey: string;
  shiftName: string;
  /** Horario del bloque en hora local, 'HH:mm'. */
  start: string;
  end: string;
  /** Inicio y fin reales de la experiencia dentro del bloque. */
  startAt: Date;
  endAt: Date;
  /** Grupo más grande que todavía entra (0 = sin lugar). */
  maxPartySize: number;
  price: number;
  depositPct: number;
}

/**
 * Disponibilidad por DÍA y TURNO, sin turnos precargados.
 *
 * El equipo define los bloques del día una sola vez (ShiftTemplate) y cualquier
 * experiencia se puede reservar en cualquiera de ellos: los turnos no son de
 * una experiencia, son del salón. El `ExperienceSession` concreto se crea solo
 * la primera vez que alguien reserva ese (experiencia, día, bloque).
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
   * Días y turnos donde se puede reservar una experiencia, entre dos fechas.
   * Salta los días cerrados y los bloques donde la experiencia no entra o no
   * está habilitada. `includeFull` deja pasar los que ya no tienen lugar (para
   * mostrarlos agotados en vez de esconderlos).
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
    const end = params.to
      ? DateTime.fromISO(params.to, { zone: tz })
      : start.plus({ days: Math.min(params.days ?? 30, 120) });
    if (!end.isValid) throw new BadRequestException('to inválido');

    const now = DateTime.now().setZone(tz);
    const out: AvailableShift[] = [];

    for (
      let d = start.startOf('day');
      d <= end.startOf('day');
      d = d.plus({ days: 1 })
    ) {
      const dateKey = d.toISODate();
      const closed = await this.closedDates.isClosed(d.toJSDate());
      if (closed.closed) continue;

      for (const shift of this.shifts.forDate(dateKey)) {
        const slot = this.slotFor(exp, dateKey, shift, tz);
        if (!slot) continue; // la experiencia no entra en ese bloque
        // No ofrecemos bloques que ya empezaron.
        if (DateTime.fromJSDate(slot.startAt) <= now) continue;

        // Tope real del bloque: lo que permiten las mesas libres, acotado por
        // el cupo nominal de la experiencia. Tiene que dar lo MISMO que el
        // preview del hold, o la web ofrece un grupo que después se rechaza.
        const free = await this.tables.remainingPartySize(dateKey, shift.key);
        const taken = await this.seatsTakenIn(exp, dateKey, shift.key);
        const maxPartySize = Math.min(
          free,
          Math.max(0, exp.defaultCapacity - taken),
        );
        if (!maxPartySize && !params.includeFull) continue;
        out.push({ ...slot, maxPartySize });
      }
    }
    return out;
  }

  /** Anotados que ya tiene esa experiencia en ese bloque (0 si no hay turno). */
  private async seatsTakenIn(
    exp: ExperienceDocument,
    dateKey: string,
    shiftKey: string,
  ): Promise<number> {
    const existing = await this.sessionModel
      .findOne({
        experienceId: exp._id as Types.ObjectId,
        dateKey,
        shiftKey,
        deletedAt: { $exists: false },
      })
      .select('seatsTaken')
      .lean();
    return existing?.seatsTaken ?? 0;
  }

  /**
   * Dónde caería una experiencia en (día, bloque), SIN crear nada. Lo usa la
   * consulta de disponibilidad: preguntar no debe escribir en la base.
   */
  async slotOrThrow(
    experienceId: string,
    dateKey: string,
    shiftKey: string,
  ): Promise<{ startAt: Date; durationMinutes: number; capacity: number }> {
    const exp = await this.experienceOrThrow(experienceId);
    const shift = this.shifts
      .forDate(dateKey)
      .find((s) => s.key === shiftKey.toUpperCase());
    if (!shift) {
      throw new BadRequestException(
        `Ese día no tiene un turno "${shiftKey}". Elegí uno de los turnos disponibles.`,
      );
    }
    const slot = this.slotFor(exp, dateKey, shift, envConfig.timezone);
    if (!slot) {
      throw new BadRequestException(
        `${exp.name} no entra en ${shift.name} (${shift.start}–${shift.end}).`,
      );
    }
    return {
      startAt: slot.startAt,
      durationMinutes: exp.durationMinutes,
      capacity: exp.defaultCapacity,
    };
  }

  /**
   * Turno concreto para (experiencia, día, bloque), creándolo si no existe.
   * Idempotente: el índice único (experienceId, dateKey, shiftKey) hace que dos
   * reservas simultáneas terminen sobre el MISMO turno en vez de duplicarlo.
   */
  async ensureSession(
    experienceId: string,
    dateKey: string,
    shiftKey: string,
  ): Promise<ExperienceSessionDocument> {
    const exp = await this.experienceOrThrow(experienceId);
    const tz = envConfig.timezone;

    const shift = this.shifts
      .forDate(dateKey)
      .find((s) => s.key === shiftKey.toUpperCase());
    if (!shift) {
      throw new BadRequestException(
        `Ese día no tiene un turno "${shiftKey}". Elegí uno de los turnos disponibles.`,
      );
    }

    const slot = this.slotFor(exp, dateKey, shift, tz);
    if (!slot) {
      const w = startWindow(shift, exp.durationMinutes);
      throw new BadRequestException(
        w
          ? `${exp.name} no está habilitada en ${shift.name}.`
          : `${exp.name} dura ${exp.durationMinutes} min y no entra en ${shift.name} (${shift.start}–${shift.end}).`,
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
      shiftKey: shift.key,
    };

    const existing = await this.sessionModel.findOne(filter).exec();
    if (existing) {
      if (existing.deletedAt || existing.status === SessionStatus.CANCELLED) {
        throw new ConflictException(
          'Ese turno fue dado de baja por el equipo. Elegí otro.',
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
   * Ubica la experiencia dentro del bloque: arranca al inicio del turno (el
   * escalonado de llegadas lo ajusta el equipo desde la agenda, no cambia la
   * ocupación de la mesa). Devuelve null si no entra o no está habilitada.
   */
  private slotFor(
    exp: ExperienceDocument,
    dateKey: string,
    shift: ShiftDef,
    tz: string,
  ): Omit<AvailableShift, 'maxPartySize'> | null {
    if (!shiftAllowsExperience(shift, String(exp._id))) return null;
    if (!startWindow(shift, exp.durationMinutes)) return null;

    const startAt = DateTime.fromISO(`${dateKey}T${shift.start}`, { zone: tz });
    if (!startAt.isValid) return null;

    return {
      dateKey,
      shiftKey: shift.key,
      shiftName: shift.name,
      start: shift.start,
      end: shift.end,
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
