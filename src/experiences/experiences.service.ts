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
import { SpaceBlocksService } from '../space-blocks/space-blocks.service';

@Injectable()
export class ExperiencesService {
  constructor(
    @InjectModel(Experience.name)
    private readonly experienceModel: Model<ExperienceDocument>,
    @InjectModel(ExperienceSession.name)
    private readonly sessionModel: Model<ExperienceSessionDocument>,
    private readonly closedDates: ClosedDatesService,
    private readonly spaceBlocks: SpaceBlocksService,
  ) {}

  // ───────────────────────── Experiencias (plantillas) ─────────────────────

  async createExperience(dto: CreateExperienceDto) {
    return this.experienceModel.create({ ...dto });
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
    Object.assign(exp, dto);
    exp.updatedAt = new Date();
    await exp.save();
    return exp;
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

    // Tope de LOCAL: la disponibilidad de cada turno se limita también por la
    // capacidad compartida del salón. Traemos todos los turnos OPEN/CLOSED
    // vigentes (con reservas activas) para calcular cuántas personas hay en cada
    // franja que se solapa. seatsAvailable = min(cupo del turno, lugar en el local).
    const activeSessions = await this.sessionModel
      .find({
        deletedAt: { $exists: false },
        status: { $in: [SessionStatus.OPEN, SessionStatus.CLOSED] },
        endAt: { $gt: new Date() },
      })
      .select('startAt endAt seatsTaken venueSeats')
      .lean();
    const venueMax = envConfig.venueMaxCapacity;

    return Promise.all(
      sessions.map(async (s) => {
        const view = this.sessionView(
          s as unknown as SessionLike,
          colorByExp.get(String(s.experienceId)),
        );
        // Cada turno ocupa max(anotados, lugares fijos): un taller con mesa
        // fija resta sus lugares aunque tenga menos inscriptos.
        const otherOccupancy = activeSessions.reduce((acc, o) => {
          if (String(o._id) === String(s._id)) return acc;
          const overlaps = o.startAt < s.endAt && o.endAt > s.startAt;
          return overlaps
            ? acc + Math.max(o.seatsTaken || 0, o.venueSeats || 0)
            : acc;
        }, 0);
        // Talleres/eventos que bloquean lugares del salón en esa franja.
        const blocked = await this.spaceBlocks.blockedSeatsFor(
          s.startAt,
          s.endAt,
        );
        const venueRemaining = Math.max(
          0,
          venueMax - otherOccupancy - blocked - s.seatsTaken,
        );
        view.seatsAvailable = Math.min(view.seatsAvailable, venueRemaining);
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
    return {
      id: String(s._id),
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
