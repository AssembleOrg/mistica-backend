import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RecurringBlock,
  RecurringBlockDocument,
} from '../common/schemas/recurring-block.schema';
import { Table, TableDocument } from '../common/schemas/table.schema';
import { businessWindow, toMinutes, weekdayOf } from './shifts';

export interface RecurringBlockInput {
  label: string;
  weekday: number;
  start: string;
  end: string;
  tableCodes: string[];
  notes?: string;
  active?: boolean;
}

/** Regla vigente, tal como la consume la agenda/disponibilidad. */
export interface RecurringBlockDef {
  id: string;
  label: string;
  weekday: number;
  start: string;
  end: string;
  tableCodes: string[];
  notes?: string;
}

/**
 * Bloqueos FIJOS semanales de mesas (taller, colonia, eventos que se repiten).
 *
 * Son pocas reglas que casi nunca cambian, así que viven en memoria y se
 * recargan cuando el admin las edita — igual que las plantillas de turno. Eso
 * deja que la disponibilidad las consulte de forma sincrónica sin ir a la
 * base en cada cálculo de agenda.
 */
@Injectable()
export class RecurringBlocksService implements OnModuleInit {
  private readonly logger = new Logger(RecurringBlocksService.name);
  private snapshot: RecurringBlockDef[] = [];

  constructor(
    @InjectModel(RecurringBlock.name)
    private readonly model: Model<RecurringBlockDocument>,
    @InjectModel(Table.name)
    private readonly tableModel: Model<TableDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /** Relee las reglas activas de la base al snapshot en memoria. */
  async reload(): Promise<void> {
    const rows = await this.model
      .find({ active: true, deletedAt: { $exists: false } })
      .sort({ weekday: 1, start: 1 })
      .lean();
    this.snapshot = rows.map((r) => ({
      id: String(r._id),
      label: r.label,
      weekday: r.weekday,
      start: r.start,
      end: r.end,
      tableCodes: r.tableCodes ?? [],
      notes: r.notes,
    }));
    this.logger.log(`Bloqueos fijos cargados: ${this.snapshot.length}.`);
  }

  /** Reglas vigentes para una fecha ('YYYY-MM-DD'), por día de la semana. */
  forDate(dateKey: string): RecurringBlockDef[] {
    if (!dateKey) return [];
    const wd = weekdayOf(dateKey);
    return this.snapshot.filter((b) => b.weekday === wd);
  }

  /** Todas las reglas (incluye inactivas) para la pantalla de edición. */
  async listAll(): Promise<RecurringBlockDocument[]> {
    return this.model
      .find({ deletedAt: { $exists: false } })
      .sort({ weekday: 1, start: 1 })
      .lean() as unknown as Promise<RecurringBlockDocument[]>;
  }

  async create(dto: RecurringBlockInput): Promise<RecurringBlockDocument> {
    const clean = await this.validate(dto);
    const created = await this.model.create(clean);
    await this.reload();
    return created;
  }

  async update(
    id: string,
    dto: Partial<RecurringBlockInput>,
  ): Promise<RecurringBlockDocument> {
    const current = await this.findOrThrow(id);
    const merged: RecurringBlockInput = {
      label: dto.label ?? current.label,
      weekday: dto.weekday ?? current.weekday,
      start: dto.start ?? current.start,
      end: dto.end ?? current.end,
      tableCodes: dto.tableCodes ?? current.tableCodes,
      notes: dto.notes !== undefined ? dto.notes : current.notes,
      active: dto.active ?? current.active,
    };
    const clean = await this.validate(merged);
    Object.assign(current, clean, { updatedAt: new Date() });
    await current.save();
    await this.reload();
    return current;
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const b = await this.findOrThrow(id);
    b.deletedAt = new Date();
    b.active = false;
    await b.save();
    await this.reload();
    return { success: true };
  }

  // ───────────────────────── validación ─────────────────────────

  /**
   * Reglas de consistencia: horas válidas dentro de la ventana del negocio,
   * fin después del inicio, mesas existentes y sin repetir.
   */
  private async validate(
    dto: RecurringBlockInput,
  ): Promise<RecurringBlockInput> {
    if (!dto.label?.trim()) {
      throw new BadRequestException('El bloqueo necesita un motivo.');
    }
    if (!Number.isInteger(dto.weekday) || dto.weekday < 1 || dto.weekday > 7) {
      throw new BadRequestException(
        'El día tiene que ser 1 (lunes) a 7 (domingo).',
      );
    }
    let startMin: number;
    let endMin: number;
    try {
      startMin = toMinutes(dto.start);
      endMin = toMinutes(dto.end);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    if (endMin <= startMin) {
      throw new BadRequestException(
        'El bloqueo termina antes de empezar. Revisá las horas.',
      );
    }
    const { openMin, closeMin } = businessWindow();
    if (startMin < openMin || endMin > closeMin) {
      throw new BadRequestException(
        'El bloqueo tiene que caer dentro del horario del salón.',
      );
    }

    const codes = [
      ...new Set((dto.tableCodes ?? []).map((c) => c.trim().toUpperCase())),
    ].filter(Boolean);
    if (!codes.length) {
      throw new BadRequestException('Elegí al menos una mesa.');
    }
    const known = new Set(
      (
        await this.tableModel
          .find({ active: true, deletedAt: { $exists: false } })
          .select('code')
          .lean()
      ).map((t) => t.code),
    );
    for (const code of codes) {
      if (!known.has(code)) {
        throw new BadRequestException(
          `La mesa ${code} no existe o está dada de baja.`,
        );
      }
    }

    return {
      label: dto.label.trim(),
      weekday: dto.weekday,
      start: dto.start,
      end: dto.end,
      tableCodes: codes,
      notes: dto.notes?.trim() || undefined,
      active: dto.active ?? true,
    };
  }

  private async findOrThrow(id: string): Promise<RecurringBlockDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const b = await this.model.findById(id).exec();
    if (!b || b.deletedAt)
      throw new NotFoundException('Bloqueo fijo no encontrado');
    return b;
  }
}
