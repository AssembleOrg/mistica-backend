import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import { envConfig } from '../config/env.config';
import {
  CreateExperienceDto,
  GenerateSessionsDto,
  UpdateExperienceDto,
  UpdateSessionDto,
} from '../common/dto';
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
import { aliasKeys, cleanAliases, normalizeAlias } from './alias';
import { TablesService } from '../tables/tables.service';
import {
  bookingStartWindow,
  checkBookingWindow,
  suggestedShiftFor,
} from '../tables/shifts';

@Injectable()
export class ExperiencesService {
  constructor(
    @InjectModel(Experience.name)
    private readonly experienceModel: Model<ExperienceDocument>,
    @InjectModel(ExperienceSession.name)
    private readonly sessionModel: Model<ExperienceSessionDocument>,
    private readonly closedDates: ClosedDatesService,
    private readonly tables: TablesService,
  ) {}

  // ───────────────────────── Experiencias (plantillas) ─────────────────────

  async createExperience(dto: CreateExperienceDto) {
    const aliases = await this.validAliases(dto.aliases, dto.name, null);
    return this.experienceModel.create({ ...dto, aliases });
  }

  async listExperiences(includeInactive = false) {
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (!includeInactive) filter.isActive = true;
    return this.experienceModel.find(filter).sort({ name: 1 }).lean();
  }

  async getExperience(id: string) {
    const exp = await this.findExperienceOrThrow(id);
    return exp;
  }

  async updateExperience(id: string, dto: UpdateExperienceDto) {
    const exp = await this.findExperienceOrThrow(id);
    if (dto.aliases !== undefined || dto.name !== undefined) {
      const aliases = await this.validAliases(
        dto.aliases ?? exp.aliases,
        dto.name ?? exp.name,
        String(exp._id),
      );
      Object.assign(exp, dto, { aliases });
    } else {
      Object.assign(exp, dto);
    }
    exp.updatedAt = new Date();
    await exp.save();
    return exp;
  }

  /**
   * Limpia los apodos y verifica que ninguno choque con el nombre o el apodo de
   * OTRA experiencia: si dos respondieran al mismo apodo, el bot no tendría
   * forma de saber a cuál se refiere el cliente.
   */
  private async validAliases(
    raw: string[] | undefined,
    name: string,
    ignoreId: string | null,
  ): Promise<string[]> {
    const aliases = cleanAliases(raw);
    if (!aliases.length) return aliases;

    const others = await this.experienceModel
      .find({ deletedAt: { $exists: false } })
      .select('name aliases')
      .lean();

    const taken = new Map<string, string>();
    for (const o of others) {
      if (ignoreId && (o._id as Types.ObjectId).toHexString() === ignoreId)
        continue;
      for (const key of aliasKeys(o.name, o.aliases ?? [])) {
        taken.set(key, o.name);
      }
    }

    const ownName = normalizeAlias(name);
    for (const a of aliases) {
      const key = normalizeAlias(a);
      if (key === ownName) continue; // repetir el propio nombre es inofensivo
      const clash = taken.get(key);
      if (clash) {
        throw new BadRequestException(
          `El apodo "${a}" ya lo usa "${clash}". Los apodos tienen que ser únicos para que el bot sepa de cuál le hablan.`,
        );
      }
    }
    return aliases;
  }

  async deleteExperience(id: string) {
    const exp = await this.findExperienceOrThrow(id);
    exp.deletedAt = new Date();
    exp.isActive = false;
    await exp.save();
    return { success: true };
  }

  // ───────────────────────── Turnos (sessions) ─────────────────────────────

  /**
   * Genera N turnos para una experiencia ("repetir carga rápida"). Cada slot
   * copia precio/cupo/duración de la plantilla salvo override. `startAt` se
   * calcula en la zona del negocio a partir de {date, time}.
   */
  async generateSessions(dto: GenerateSessionsDto) {
    const exp = await this.findExperienceOrThrow(dto.experienceId);
    const tz = envConfig.timezone;
    const status =
      dto.publish === false ? SessionStatus.DRAFT : SessionStatus.OPEN;

    const docs: Array<Record<string, unknown>> = [];
    for (const slot of dto.slots) {
      const start = DateTime.fromISO(`${slot.date}T${slot.time}`, { zone: tz });
      if (!start.isValid) {
        throw new BadRequestException(
          `Fecha/hora inválida: ${slot.date} ${slot.time}`,
        );
      }
      // No dejamos crear turnos en días marcados como cerrados.
      const closed = await this.closedDates.isClosed(start.toJSDate());
      if (closed.closed) {
        throw new BadRequestException(
          `El ${slot.date} el local está marcado como cerrado${closed.reason ? ` (${closed.reason})` : ''}. Quitá ese día o eliminá la regla de cierre.`,
        );
      }
      const durationMinutes = exp.durationMinutes;
      // Única restricción dura: entrar en la ventana del negocio (empezar
      // después de abrir, terminar antes de cerrar). Los turnos son sugerencia.
      if (!checkBookingWindow(start.toJSDate(), durationMinutes).ok) {
        throw new BadRequestException(
          this.badStartMessage(slot.date, slot.time, durationMinutes),
        );
      }
      const end = start.plus({ minutes: durationMinutes });
      docs.push({
        experienceId: exp._id,
        experienceName: exp.name,
        durationMinutes,
        price: slot.price ?? exp.basePrice,
        depositPct: exp.depositPct ?? 50,
        startAt: start.toJSDate(),
        endAt: end.toJSDate(),
        capacity: slot.capacity ?? exp.defaultCapacity,
        seatsTaken: 0,
        venueSeats: exp.venueSeats ?? 0,
        status,
        notes: slot.notes,
      });
    }

    const created = await this.sessionModel.insertMany(docs);
    return created.map((s) =>
      this.sessionView(s as unknown as SessionLike, exp.color),
    );
  }

  async listSessions(params: {
    experienceId?: string;
    status?: SessionStatus;
    from?: string;
    to?: string;
    includePast?: boolean;
  }) {
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (params.experienceId) {
      if (!Types.ObjectId.isValid(params.experienceId))
        throw new BadRequestException('experienceId inválido');
      filter.experienceId = new Types.ObjectId(params.experienceId);
    }
    if (params.status) filter.status = params.status;

    const startAt: Record<string, Date> = {};
    if (params.from) startAt.$gte = new Date(params.from);
    if (params.to) startAt.$lte = new Date(params.to);
    if (!params.from && !params.includePast) {
      startAt.$gte = new Date(); // por defecto, sólo turnos futuros
    }
    if (Object.keys(startAt).length) filter.startAt = startAt;

    const sessions = await this.sessionModel
      .find(filter)
      .sort({ startAt: 1 })
      .lean();

    // Color actual de cada experiencia (join dinámico: si el admin cambia el
    // color de la plantilla, la agenda entera se repinta sin migrar turnos).
    const expIds = [...new Set(sessions.map((s) => String(s.experienceId)))];
    const exps = await this.experienceModel
      .find({ _id: { $in: expIds } })
      .select('color')
      .lean();
    const colorByExp = new Map(exps.map((e) => [String(e._id), e.color]));

    // Tope de MESAS: lo que limita de verdad es el grupo más grande que entra
    // en las mesas libres del turno del día. No es la suma de asientos sueltos:
    // si quedan 3 mesas de 2, una reserva sola no puede pasar de 6 personas.
    return Promise.all(
      sessions.map(async (s) => {
        const view = this.sessionView(
          s as unknown as SessionLike,
          colorByExp.get(String(s.experienceId)),
        );
        if (!checkBookingWindow(s.startAt, s.durationMinutes).ok) {
          // Turno mal cargado (fuera de la ventana del negocio): no se puede
          // reservar hasta corregirlo.
          view.seatsAvailable = 0;
          view.shiftKey = undefined;
          view.shiftName = undefined;
          return view;
        }
        view.seatsAvailable = Math.min(
          view.seatsAvailable,
          await this.tables.remainingPartySize(s.startAt, s.durationMinutes),
        );
        return view;
      }),
    );
  }

  async getSession(id: string) {
    const s = await this.findSessionOrThrow(id);
    return this.sessionView(
      s as unknown as SessionLike,
      await this.experienceColor(s.experienceId),
    );
  }

  async updateSession(id: string, dto: UpdateSessionDto) {
    const s = await this.findSessionOrThrow(id);

    if (dto.capacity !== undefined) {
      if (dto.capacity < s.seatsTaken) {
        throw new BadRequestException(
          `El cupo (${dto.capacity}) no puede ser menor a los asientos ya tomados (${s.seatsTaken}).`,
        );
      }
      s.capacity = dto.capacity;
    }
    if (dto.price !== undefined) s.price = dto.price;
    if (dto.status !== undefined) s.status = dto.status;
    if (dto.notes !== undefined) s.notes = dto.notes;
    s.updatedAt = new Date();
    await s.save();
    return this.sessionView(
      s as unknown as SessionLike,
      await this.experienceColor(s.experienceId),
    );
  }

  /** Baja de turno: sólo si no tiene asientos tomados. Si tiene, cancelar. */
  async deleteSession(id: string) {
    const s = await this.findSessionOrThrow(id);
    if (s.seatsTaken > 0) {
      throw new BadRequestException(
        'El turno tiene reservas. Cancelalo (status CANCELLED) en vez de eliminarlo.',
      );
    }
    s.deletedAt = new Date();
    s.status = SessionStatus.CANCELLED;
    await s.save();
    return { success: true };
  }

  // ───────────────────────── Helpers ─────────────────────────

  /** Explica por qué un horario no entra y qué horarios sí sirven. */
  private badStartMessage(
    date: string,
    time: string,
    durationMinutes: number,
  ): string {
    const w = bookingStartWindow(durationMinutes);
    if (!w) {
      return (
        `Una experiencia de ${durationMinutes} minutos no entra en el horario del salón ` +
        `(${envConfig.businessOpen}–${envConfig.businessClose}). Ajustá la duración.`
      );
    }
    return (
      `El ${date} a las ${time} la experiencia termina después del cierre o ` +
      `empieza antes de abrir (dura ${durationMinutes} min). ` +
      `Horarios de inicio posibles: entre ${w.earliest} y ${w.latest}.`
    );
  }

  private async findExperienceOrThrow(id: string): Promise<ExperienceDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const exp = await this.experienceModel.findById(id).exec();
    if (!exp || exp.deletedAt)
      throw new NotFoundException('Experiencia no encontrada');
    return exp;
  }

  private async findSessionOrThrow(
    id: string,
  ): Promise<ExperienceSessionDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const s = await this.sessionModel.findById(id).exec();
    if (!s || s.deletedAt) throw new NotFoundException('Turno no encontrado');
    return s;
  }

  private async experienceColor(
    experienceId: unknown,
  ): Promise<string | undefined> {
    const exp = await this.experienceModel
      .findById(experienceId)
      .select('color')
      .lean();
    return exp?.color;
  }

  private sessionView(s: SessionLike, experienceColor?: string) {
    // El turno sugerido se deriva de la hora de inicio y la duración. Es una
    // etiqueta: un horario fuera de todo turno es válido igual.
    const placed = suggestedShiftFor(s.startAt, s.durationMinutes);
    return {
      id: String(s._id),
      shiftKey: placed?.shift.key,
      shiftName: placed?.shift.name,
      experienceId: String(s.experienceId),
      experienceName: s.experienceName,
      experienceColor: experienceColor ?? '#9d684e',
      durationMinutes: s.durationMinutes,
      price: s.price,
      depositPct: s.depositPct ?? 50,
      startAt: s.startAt,
      endAt: s.endAt,
      capacity: s.capacity,
      seatsTaken: s.seatsTaken,
      seatsAvailable: Math.max(0, s.capacity - s.seatsTaken),
      status: s.status,
      notes: s.notes,
    };
  }
}

/** Forma mínima de un turno para construir su vista (doc o lean). */
interface SessionLike {
  _id: unknown;
  experienceId: unknown;
  experienceName: string;
  durationMinutes: number;
  price: number;
  depositPct?: number;
  startAt: Date;
  endAt: Date;
  capacity: number;
  seatsTaken: number;
  status: SessionStatus;
  notes?: string;
}
