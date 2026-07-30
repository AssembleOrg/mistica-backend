import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { envConfig } from '../config/env.config';
import {
  ShiftTemplate,
  ShiftTemplateDocument,
} from '../common/schemas/shift-template.schema';
import {
  ShiftDef,
  parseShifts,
  setShiftProvider,
  shiftsForDate,
} from './shifts';

/**
 * Turnos del día, editables desde el panel.
 *
 * Son dos o tres documentos que casi nunca cambian, así que se mantienen en
 * memoria y se recargan cuando el admin los edita. Eso deja que el resto del
 * backend siga resolviendo turnos de forma sincrónica (`resolveShift`) sin
 * convertir media aplicación en async por una consulta que siempre da lo mismo.
 *
 * Si la colección está vacía, se cae a la definición de la env `SHIFTS`: un
 * deploy sin plantillas cargadas sigue funcionando igual que antes.
 */
@Injectable()
export class ShiftsService implements OnModuleInit {
  private readonly logger = new Logger(ShiftsService.name);
  private snapshot: ShiftDef[] = [];

  constructor(
    @InjectModel(ShiftTemplate.name)
    private readonly model: Model<ShiftTemplateDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
    setShiftProvider((dateKey) => shiftsForDate(this.snapshot, dateKey));
  }

  /** Relee las plantillas de la base al snapshot en memoria. */
  async reload(): Promise<void> {
    const rows = await this.model
      .find({ active: true, deletedAt: { $exists: false } })
      .sort({ order: 1, start: 1 })
      .lean();

    if (!rows.length) {
      this.snapshot = parseShifts(
        envConfig.shifts,
        envConfig.cleaningBufferMinutes,
      );
      this.logger.log(
        `Sin plantillas de turno en base: uso la env SHIFTS (${this.snapshot.length} turnos).`,
      );
      return;
    }

    this.snapshot = rows.map((r) => ({
      key: r.key,
      name: r.name,
      start: r.start,
      end: r.end,
      weekday: r.weekday,
      experienceIds: (r.experienceIds ?? []).map((id) => String(id)),
    }));
    this.logger.log(`Turnos cargados desde la base: ${rows.length}.`);
  }

  /** Todas las plantillas (incluye inactivas) para la pantalla de edición. */
  async listAll(): Promise<ShiftTemplateDocument[]> {
    return this.model
      .find({ deletedAt: { $exists: false } })
      .sort({ weekday: 1, order: 1, start: 1 })
      .lean() as unknown as Promise<ShiftTemplateDocument[]>;
  }

  /** Turnos vigentes para una fecha ('YYYY-MM-DD'), ya filtrados por día. */
  forDate(dateKey: string): ShiftDef[] {
    return shiftsForDate(this.snapshot, dateKey);
  }

  async create(dto: ShiftTemplateInput): Promise<ShiftTemplateDocument> {
    await this.assertConsistent(dto, null);
    const created = await this.model.create({
      ...dto,
      experienceIds: (dto.experienceIds ?? []).map(
        (id) => new Types.ObjectId(id),
      ),
    });
    await this.reload();
    return created;
  }

  async update(
    id: string,
    dto: Partial<ShiftTemplateInput>,
  ): Promise<ShiftTemplateDocument> {
    const current = await this.findOrThrow(id);
    const merged: ShiftTemplateInput = {
      key: dto.key ?? current.key,
      name: dto.name ?? current.name,
      start: dto.start ?? current.start,
      end: dto.end ?? current.end,
      weekday: dto.weekday !== undefined ? dto.weekday : current.weekday,
      experienceIds:
        dto.experienceIds ??
        (current.experienceIds ?? []).map((x) => String(x)),
      order: dto.order ?? current.order,
      active: dto.active ?? current.active,
    };
    await this.assertConsistent(merged, String(current._id));

    Object.assign(current, {
      ...merged,
      experienceIds: (merged.experienceIds ?? []).map(
        (x) => new Types.ObjectId(x),
      ),
    });
    await current.save();
    await this.reload();
    return current;
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const t = await this.findOrThrow(id);
    t.deletedAt = new Date();
    t.active = false;
    await t.save();
    await this.reload();
    return { success: true };
  }

  // ───────────────────────── validación ─────────────────────────

  /**
   * Un turno nuevo/editado tiene que convivir con los del mismo día: sin
   * solaparse y dejando el hueco de limpieza. Se valida con las MISMAS reglas
   * que la env (parseShifts), así no hay dos criterios distintos.
   */
  private async assertConsistent(
    dto: ShiftTemplateInput,
    ignoreId: string | null,
  ): Promise<void> {
    if (dto.active === false) return; // una plantilla apagada no molesta a nadie

    const siblings = (
      await this.model
        .find({ active: true, deletedAt: { $exists: false } })
        .lean()
    )
      .filter((s) => (s._id as Types.ObjectId).toHexString() !== ignoreId)
      // Comparten día si apuntan al mismo weekday, o si alguna es genérica.
      .filter(
        (s) =>
          s.weekday == null || dto.weekday == null || s.weekday === dto.weekday,
      );

    const all = [...siblings, dto].sort((a, b) =>
      a.start.localeCompare(b.start),
    );
    const raw = all
      .map((s) => `${s.key}|${s.name}|${s.start}|${s.end}`)
      .join(';');

    try {
      parseShifts(raw, envConfig.cleaningBufferMinutes);
    } catch (err) {
      throw new BadRequestException(
        `No se puede guardar el turno: ${(err as Error).message}`,
      );
    }
  }

  private async findOrThrow(id: string): Promise<ShiftTemplateDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const t = await this.model.findById(id).exec();
    if (!t || t.deletedAt) throw new NotFoundException('Turno no encontrado');
    return t;
  }
}

export interface ShiftTemplateInput {
  key: string;
  name: string;
  start: string;
  end: string;
  weekday?: number;
  experienceIds?: string[];
  order?: number;
  active?: boolean;
}
