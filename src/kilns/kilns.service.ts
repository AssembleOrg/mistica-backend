import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { canManage } from '../common/enums/user-role.enum';
import { User, UserDocument } from '../common/schemas/user.schema';
import { businessDayBound } from '../common/utils/date-filter.util';
import {
  KILNS,
  KILN_ACTIONS,
  KILN_DURATION_MS,
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

  async create(dto: CreateKilnLogDto, actor?: { id?: string; role?: string }) {
    // Un horno que se prendió y nadie marcó: admin/encargado lo cargan después.
    let at = new Date();
    if (dto.at) {
      if (!canManage(actor?.role)) {
        throw new ForbiddenException('Sólo admin o encargado cargan hornos pasados.');
      }
      at = new Date(dto.at);
      if (at.getTime() > Date.now() + 60_000) {
        throw new BadRequestException('La fecha del horno no puede ser futura.');
      }
    }
    // Prendido ahora: no se vuelve a prender hasta que termine su tiempo.
    if (!dto.at && dto.action === 'ON') {
      const st = await this.kilnStatus(dto.kiln as KilnKey);
      if (st.running && st.endsAt) {
        const hora = st.endsAt.toLocaleString('es-AR', {
          timeZone: 'America/Argentina/Buenos_Aires',
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        throw new BadRequestException(
          `El horno de ${KILNS[dto.kiln as KilnKey].toLowerCase()} sigue prendido hasta ${hora}.`,
        );
      }
    }
    let byName = dto.registeredBy?.trim();
    if (!byName && actor?.id && Types.ObjectId.isValid(actor.id)) {
      byName = (await this.userModel.findById(actor.id).select('name').lean())?.name;
    }
    const doc = await this.model.create({
      kiln: dto.kiln as KilnKey,
      action: dto.action as KilnAction,
      at,
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

  /**
   * Estado de un horno: el último prendido corre su tiempo (13 h frontal,
   * 26 h superior). Un apagado viejo, de cuando se anotaba, lo corta.
   */
  private async kilnStatus(kiln: KilnKey) {
    const last = await this.model
      .findOne({ kiln, deletedAt: { $exists: false } })
      .sort({ at: -1 })
      .lean();
    const durationMs = KILN_DURATION_MS[kiln];
    const endsAt =
      last?.action === 'ON' ? new Date(new Date(last.at).getTime() + durationMs) : null;
    const running = !!endsAt && endsAt.getTime() > Date.now();
    return {
      kiln,
      kilnName: KILNS[kiln],
      on: running,
      running,
      durationMs,
      endsAt,
      last: last ? this.view(last) : null,
    };
  }

  /** Cada horno: si está prendido y hasta cuándo. */
  async status() {
    return Promise.all((Object.keys(KILNS) as KilnKey[]).map((k) => this.kilnStatus(k)));
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
