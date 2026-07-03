import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DateTime } from 'luxon';
import { SpaceBlockDocument } from '../common/schemas';
import { CreateSpaceBlockDto, UpdateSpaceBlockDto } from '../common/dto';
import { envConfig } from '../config/env.config';

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

@Injectable()
export class SpaceBlocksService {
  constructor(
    @InjectModel('SpaceBlock')
    private readonly model: Model<SpaceBlockDocument>,
  ) {}

  async create(dto: CreateSpaceBlockDto): Promise<SpaceBlockDocument> {
    return this.model.create({
      kind: dto.kind,
      weekday: dto.kind === 'WEEKLY' ? dto.weekday : undefined,
      date: dto.kind === 'ONE_OFF' ? dto.date : undefined,
      start: dto.start,
      end: dto.end,
      seats: dto.seats,
      label: dto.label?.trim(),
    });
  }

  async list(): Promise<SpaceBlockDocument[]> {
    return this.model
      .find({ deletedAt: { $exists: false } })
      .sort({ kind: 1, weekday: 1, date: 1, start: 1 })
      .lean();
  }

  async update(
    id: string,
    dto: UpdateSpaceBlockDto,
  ): Promise<SpaceBlockDocument> {
    const b = await this.model.findOne({ _id: id, deletedAt: { $exists: false } });
    if (!b) throw new NotFoundException('Bloqueo no encontrado');
    if (dto.weekday != null) b.weekday = dto.weekday;
    if (dto.date != null) b.date = dto.date;
    if (dto.start != null) b.start = dto.start;
    if (dto.end != null) b.end = dto.end;
    if (dto.seats != null) b.seats = dto.seats;
    if (dto.label != null) b.label = dto.label.trim();
    await b.save();
    return b;
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const res = await this.model.updateOne(
      { _id: id, deletedAt: { $exists: false } },
      { $set: { deletedAt: new Date() } },
    );
    if (!res.matchedCount) throw new NotFoundException('Bloqueo no encontrado');
    return { success: true };
  }

  /**
   * Lugares del salón ocupados por bloqueos (talleres/eventos) que se solapan con
   * la franja [startAt, endAt). Interpreta la franja en hora de Argentina y compara
   * día de semana (WEEKLY) o fecha (ONE_OFF) + solapamiento horario. Suma los
   * `seats` de todos los bloqueos que aplican.
   */
  async blockedSeatsFor(startAt: Date, endAt: Date): Promise<number> {
    const tz = envConfig.timezone;
    const s = DateTime.fromJSDate(startAt).setZone(tz);
    const e = DateTime.fromJSDate(endAt).setZone(tz);
    const sMin = s.hour * 60 + s.minute;
    // Si termina en otro día (cruza medianoche), lo tratamos hasta fin del día.
    const eMin = e.hasSame(s, 'day') ? e.hour * 60 + e.minute : 24 * 60;
    const weekday = s.weekday; // 1..7 (lun..dom)
    const dateStr = s.toISODate();

    const blocks = await this.model
      .find({ deletedAt: { $exists: false } })
      .lean();
    let sum = 0;
    for (const b of blocks) {
      const applies =
        b.kind === 'WEEKLY' ? b.weekday === weekday : b.date === dateStr;
      if (!applies) continue;
      const bs = toMin(b.start);
      const be = toMin(b.end);
      if (bs < eMin && be > sMin) sum += b.seats || 0;
    }
    return sum;
  }
}
