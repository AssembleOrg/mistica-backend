import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PieceDocument } from '../common/schemas';
import {
  PieceType,
  PieceTypeDocument,
} from '../common/schemas/piece-type.schema';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Catálogo de piezas (taza, bowl, plato…) para el selector de "Pieza elegida".
 * La ficha guarda el nombre como texto, así que editar o borrar un ítem del
 * catálogo no cambia las piezas ya registradas.
 */
@Injectable()
export class PieceTypesService {
  constructor(
    @InjectModel(PieceType.name)
    private readonly typeModel: Model<PieceTypeDocument>,
    @InjectModel('Piece') private readonly pieceModel: Model<PieceDocument>,
  ) {}

  private view(t: PieceTypeDocument) {
    return { id: String(t._id), name: t.name };
  }

  async list() {
    await this.seedFromHistory();
    const rows = await this.typeModel
      .find({ deletedAt: { $exists: false } })
      .collation({ locale: 'es', strength: 1 })
      .sort({ name: 1 })
      .exec();
    return rows.map((t) => this.view(t));
  }

  async create(name: string) {
    const clean = name.trim();
    await this.assertFree(clean);
    return this.view(await this.typeModel.create({ name: clean }));
  }

  async update(id: string, name: string) {
    const clean = name.trim();
    this.assertId(id);
    await this.assertFree(clean, id);
    const t = await this.typeModel
      .findOneAndUpdate(
        { _id: id, deletedAt: { $exists: false } },
        { $set: { name: clean } },
        { new: true },
      )
      .exec();
    if (!t) throw new NotFoundException('Pieza no encontrada');
    return this.view(t);
  }

  async remove(id: string) {
    this.assertId(id);
    const t = await this.typeModel
      .findOneAndUpdate(
        { _id: id, deletedAt: { $exists: false } },
        { $set: { deletedAt: new Date() } },
      )
      .exec();
    if (!t) throw new NotFoundException('Pieza no encontrada');
    return { success: true };
  }

  private assertId(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('id inválido');
  }

  /** Sin repetidos (ignora mayúsculas y espacios de los costados). */
  private async assertFree(name: string, exceptId?: string) {
    if (!name) throw new BadRequestException('El nombre es obligatorio');
    const dup = await this.typeModel
      .findOne({
        name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
        deletedAt: { $exists: false },
        ...(exceptId && { _id: { $ne: exceptId } }),
      })
      .lean();
    if (dup) throw new BadRequestException(`Ya existe "${dup.name}" en el catálogo`);
  }

  /**
   * La primera vez (catálogo nunca usado) arranca con las piezas que ya se
   * cargaron a mano en las fichas, así el selector no nace vacío.
   */
  private async seedFromHistory() {
    if ((await this.typeModel.estimatedDocumentCount()) > 0) return;
    const used = (await this.pieceModel.distinct('pieceType', {
      deletedAt: { $exists: false },
    })) as unknown[];
    const byKey = new Map<string, string>();
    for (const raw of used) {
      if (typeof raw !== 'string') continue;
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, name);
    }
    if (byKey.size === 0) return;
    await this.typeModel.insertMany(
      [...byKey.values()].map((name) => ({ name })),
    );
  }
}
