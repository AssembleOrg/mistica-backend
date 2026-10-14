import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../common/schemas/user.schema';
import { businessDayBound } from '../common/utils/date-filter.util';
import {
  KILNS,
  KILN_ACTIONS,
  KilnAction,
  KilnKey,
  KilnLog,
  KilnLogDocument,
} from './kiln-log.schema';
import { CreateKilnLogDto } from './kilns.dto';

@Injectable()
export class KilnsService {
  constructor(
    @InjectModel(KilnLog.name) private readonly model: Model<KilnLogDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  private view(l: KilnLog & { _id: unknown }) {
    return {
      id: String(l._id),
      kiln: l.kiln,
      kilnName: KILNS[l.kiln],
      action: l.action,
      actionName: KILN_ACTIONS[l.action],
      at: l.at,
      byName: l.byName,
      note: l.note,
    };
  }

  async create(dto: CreateKilnLogDto, actor?: { id?: string }) {
    let byName = dto.registeredBy?.trim();
    if (!byName && actor?.id && Types.ObjectId.isValid(actor.id)) {
      byName = (await this.userModel.findById(actor.id).select('name').lean())?.name;
    }
    const doc = await this.model.create({
      kiln: dto.kiln as KilnKey,
      action: dto.action as KilnAction,
      at: new Date(),
      userId:
        actor?.id && Types.ObjectId.isValid(actor.id)
          ? new Types.ObjectId(actor.id)
          : undefined,
      byName,
      note: dto.note?.trim() || undefined,
    });
    return this.view(doc.toObject());
  }

  /** Movimientos entre dos días (hora de Argentina), del más nuevo al más viejo. */
  async list(from: string, to: string) {
    const rows = await this.model
      .find({
        deletedAt: { $exists: false },
        at: { $gte: businessDayBound(from, 'start'), $lte: businessDayBound(to, 'end') },
      })
      .sort({ at: -1 })
      .lean();
    return rows.map((r) => this.view(r));
  }

  /** Último movimiento de cada horno: si está prendido y desde cuándo. */
  async status() {
    return Promise.all(
      (Object.keys(KILNS) as KilnKey[]).map(async (kiln) => {
        const last = await this.model
          .findOne({ kiln, deletedAt: { $exists: false } })
          .sort({ at: -1 })
          .lean();
        return {
          kiln,
          kilnName: KILNS[kiln],
          on: last?.action === 'ON',
          last: last ? this.view(last) : null,
        };
      }),
    );
  }

  /** Un registro cargado por error (sólo admin/encargado). */
  async remove(id: string) {
    const res = await this.model.updateOne(
      { _id: id, deletedAt: { $exists: false } },
      { $set: { deletedAt: new Date() } },
    );
    if (!res.matchedCount) throw new NotFoundException('Registro no encontrado');
    return { success: true };
  }
}
