import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import { envConfig } from '../config/env.config';
import { CreateClosedDateDto } from '../common/dto/closed-date.dto';
import { ClosedDateKind } from '../common/enums/closed-date.enum';
import {
  ClosedDate,
  ClosedDateDocument,
} from '../common/schemas/closed-date.schema';

const WEEKDAY_LABEL: Record<number, string> = {
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
  7: 'domingo',
};

// Cuántos días hacia adelante materializamos para el bot (y para la web).
const PUBLIC_HORIZON_DAYS = 60;

@Injectable()
export class ClosedDatesService {
  constructor(
    @InjectModel(ClosedDate.name)
    private readonly model: Model<ClosedDateDocument>,
  ) {}

  private get tz(): string {
    return envConfig.timezone;
  }

  // ───────────────────────── CRUD (admin) ─────────────────────────

  async create(dto: CreateClosedDateDto, createdBy?: string) {
    if (dto.kind === ClosedDateKind.WEEKLY) {
      if (dto.weekday == null)
        throw new BadRequestException('weekday es requerido para kind=WEEKLY');
      // Evitar duplicar la misma regla semanal.
      const dup = await this.model
        .findOne({
          kind: ClosedDateKind.WEEKLY,
          weekday: dto.weekday,
          deletedAt: { $exists: false },
        })
        .lean();
      if (dup)
        throw new BadRequestException(
          `Ya existe una regla para los ${WEEKDAY_LABEL[dto.weekday]}.`,
        );
      const doc = await this.model.create({
        kind: ClosedDateKind.WEEKLY,
        weekday: dto.weekday,
        reason: dto.reason,
        createdBy: createdBy ? new Types.ObjectId(createdBy) : undefined,
      });
      return this.view(doc);
    }

    // kind = DATE
    if (!dto.from)
      throw new BadRequestException('from es requerido para kind=DATE');
    const fromDt = DateTime.fromISO(dto.from, { zone: this.tz }).startOf('day');
    const toDt = DateTime.fromISO(dto.to ?? dto.from, { zone: this.tz }).endOf(
      'day',
    );
    if (!fromDt.isValid || !toDt.isValid)
      throw new BadRequestException('Fechas inválidas');
    if (toDt < fromDt)
      throw new BadRequestException('`to` no puede ser anterior a `from`');

    const doc = await this.model.create({
      kind: ClosedDateKind.DATE,
      from: fromDt.toJSDate(),
      to: toDt.toJSDate(),
      reason: dto.reason,
      createdBy: createdBy ? new Types.ObjectId(createdBy) : undefined,
    });
    return this.view(doc);
  }

  async list() {
    const docs = await this.model
      .find({ deletedAt: { $exists: false } })
      .sort({ kind: 1, weekday: 1, from: 1 })
      .lean();
    return docs.map((d) => this.view(d as unknown as ClosedDate));
  }

  async remove(id: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const doc = await this.model.findById(id).exec();
    if (!doc || doc.deletedAt)
      throw new NotFoundException('Regla no encontrada');
    doc.deletedAt = new Date();
    await doc.save();
    return { success: true };
  }

  // ───────────────────────── Consulta (guardas + bot) ─────────────────────────

  /**
   * ¿El local está cerrado en esta fecha/hora? Compara por DÍA en la zona del
   * negocio. Lo usan las guardas de generación de turnos y de reserva.
   */
  async isClosed(when: Date): Promise<{ closed: boolean; reason?: string }> {
    const rules = await this.model
      .find({ deletedAt: { $exists: false } })
      .lean();
    const dt = DateTime.fromJSDate(when).setZone(this.tz);
    const isoWeekday = dt.weekday; // 1=lunes … 7=domingo
    for (const r of rules) {
      if (r.kind === ClosedDateKind.WEEKLY && r.weekday === isoWeekday) {
        return { closed: true, reason: r.reason };
      }
      if (r.kind === ClosedDateKind.DATE && r.from && r.to) {
        const from = DateTime.fromJSDate(r.from).setZone(this.tz);
        const to = DateTime.fromJSDate(r.to).setZone(this.tz);
        if (dt >= from && dt <= to) return { closed: true, reason: r.reason };
      }
    }
    return { closed: false };
  }

  /**
   * Vista pública para el bot/web: reglas semanales, rangos próximos y la lista
   * MATERIALIZADA de días cerrados (YYYY-MM-DD) en el horizonte. El bot usa
   * `days` para chequear fechas concretas sin tener que calcular nada.
   */
  async describePublic() {
    const rules = await this.list();
    const today = DateTime.now().setZone(this.tz).startOf('day');
    const todayYmd = today.toFormat('yyyy-MM-dd');
    const horizon = today.plus({ days: PUBLIC_HORIZON_DAYS });

    const weekly = rules
      .filter((r) => r.kind === ClosedDateKind.WEEKLY && r.weekday != null)
      .map((r) => {
        const wd = r.weekday ?? 0;
        return { weekday: wd, label: WEEKDAY_LABEL[wd], reason: r.reason ?? '' };
      });

    const ranges = rules
      .filter(
        (r): r is typeof r & { from: string; to: string } =>
          r.kind === ClosedDateKind.DATE && !!r.to && r.to >= todayYmd,
      )
      .map((r) => ({ from: r.from, to: r.to, reason: r.reason ?? '' }));

    // Materializar día a día en el horizonte.
    const days: string[] = [];
    for (let d = today; d <= horizon; d = d.plus({ days: 1 })) {
      if (this.isClosedFromRules(rules, d)) days.push(d.toFormat('yyyy-MM-dd'));
    }

    return { weekly, ranges, days };
  }

  // Versión sincrónica de isClosed sobre reglas ya cargadas (para materializar).
  private isClosedFromRules(
    rules: ReturnType<ClosedDatesService['view']>[],
    dt: DateTime,
  ): boolean {
    const isoWeekday = dt.weekday;
    for (const r of rules) {
      if (r.kind === ClosedDateKind.WEEKLY && r.weekday === isoWeekday)
        return true;
      if (r.kind === ClosedDateKind.DATE && r.from && r.to) {
        const ymd = dt.toFormat('yyyy-MM-dd');
        if (r.from <= ymd && ymd <= r.to) return true;
      }
    }
    return false;
  }

  // ───────────────────────── Helpers ─────────────────────────

  private view(d: ClosedDate & { _id?: unknown }) {
    return {
      id: d._id ? String(d._id) : '',
      kind: d.kind,
      weekday: d.weekday,
      // Para DATE devolvemos sólo el día (YYYY-MM-DD), que es como se cargan.
      from: d.from ? DateTime.fromJSDate(d.from).setZone(this.tz).toFormat('yyyy-MM-dd') : undefined,
      to: d.to ? DateTime.fromJSDate(d.to).setZone(this.tz).toFormat('yyyy-MM-dd') : undefined,
      reason: d.reason,
    };
  }
}
