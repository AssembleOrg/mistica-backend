import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PieceExtra,
  PieceExtraDocument,
} from '../common/schemas/piece-extra.schema';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Con qué arranca el catálogo la primera vez (precios a ajustar por el local). */
const DEFAULT_EXTRAS = [
  { name: 'Incluida', amount: 500 },
  { name: 'Estándar', amount: 500 },
  { name: 'Premium', amount: 500 },
  { name: 'Premium XL', amount: 500 },
];

/**
 * Catálogo de adicionales de pieza. Al registrar la ficha de una reserva se
 * copia título y monto, así que cambiar el catálogo no toca lo ya cobrado.
 */
@Injectable()
export class PieceExtrasService {
  constructor(
    @InjectModel(PieceExtra.name)
    private readonly extraModel: Model<PieceExtraDocument>,
  ) {}

  private view(x: PieceExtraDocument) {
    return {
      id: String(x._id),
      name: x.name,
      amount: x.amount,
      pair: !!x.pair,
      ...(x.addAmount != null && { addAmount: x.addAmount }),
      ...(x.material && { material: x.material }),
    };
  }

  async list() {
    if ((await this.extraModel.estimatedDocumentCount()) === 0) {
      await this.extraModel.insertMany(DEFAULT_EXTRAS);
    }
    const rows = await this.extraModel
      .find({ deletedAt: { $exists: false } })
      .sort({ amount: 1, name: 1 })
      .exec();
    return rows.map((x) => this.view(x));
  }

  /** Los adicionales vigentes por id (para cobrar lo que dice el catálogo). */
  async byIds(ids: string[]) {
    const valid = ids.filter((id) => Types.ObjectId.isValid(id));
    const rows = await this.extraModel
      .find({ _id: { $in: valid }, deletedAt: { $exists: false } })
      .exec();
    return new Map(rows.map((x) => [String(x._id), this.view(x)]));
  }

  async create(
    name: string,
    amount: number,
    pair?: boolean,
    extra: { addAmount?: number; material?: string } = {},
  ) {
    const clean = name.trim();
    await this.assertFree(clean);
    return this.view(
      await this.extraModel.create({
        name: clean,
        amount,
        ...(pair && { pair }),
        ...(extra.addAmount != null && { addAmount: extra.addAmount }),
        ...(extra.material?.trim() && { material: extra.material.trim() }),
      }),
    );
  }

  /** `addAmount`/`material`: undefined no los toca; '' en material lo quita. */
  async update(
    id: string,
    name: string,
    amount: number,
    pair?: boolean,
    extra: { addAmount?: number | null; material?: string } = {},
  ) {
    const clean = name.trim();
    this.assertId(id);
    await this.assertFree(clean, id);
    const set: Record<string, unknown> = { name: clean, amount };
    const unset: Record<string, 1> = {};
    if (pair !== undefined) set.pair = pair;
    if (extra.addAmount != null) set.addAmount = extra.addAmount;
    else if (extra.addAmount === null) unset.addAmount = 1;
    if (extra.material !== undefined) {
      if (extra.material.trim()) set.material = extra.material.trim();
      else unset.material = 1;
    }
    const x = await this.extraModel
      .findOneAndUpdate(
        { _id: id, deletedAt: { $exists: false } },
        { $set: set, ...(Object.keys(unset).length && { $unset: unset }) },
        { new: true },
      )
      .exec();
    if (!x) throw new NotFoundException('Adicional no encontrado');
    return this.view(x);
  }

  async remove(id: string) {
    this.assertId(id);
    const x = await this.extraModel
      .findOneAndUpdate(
        { _id: id, deletedAt: { $exists: false } },
        { $set: { deletedAt: new Date() } },
      )
      .exec();
    if (!x) throw new NotFoundException('Adicional no encontrado');
    return { success: true };
  }

  private assertId(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('id inválido');
  }

  private async assertFree(name: string, exceptId?: string) {
    if (!name) throw new BadRequestException('El título es obligatorio');
    const dup = await this.extraModel
      .findOne({
        name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
        deletedAt: { $exists: false },
        ...(exceptId && { _id: { $ne: exceptId } }),
      })
      .lean();
    if (dup) throw new BadRequestException(`Ya existe "${dup.name}" en los adicionales`);
  }
}
