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
import {
  PieceExtra,
  PieceExtraDocument,
} from '../common/schemas/piece-extra.schema';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Clave para comparar nombres: sin mayúsculas, tildes ni espacios de más. */
function key(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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
    @InjectModel(PieceExtra.name)
    private readonly extraModel: Model<PieceExtraDocument>,
  ) {}

  private view(t: PieceTypeDocument) {
    return {
      id: String(t._id),
      name: t.name,
      extraId: t.extraId ? String(t.extraId) : undefined,
    };
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

  /** `extraId`: categoría ('' la quita; undefined no la toca). */
  async create(name: string, extraId?: string) {
    const clean = name.trim();
    await this.assertFree(clean);
    const category = await this.category(extraId);
    return this.view(
      await this.typeModel.create({
        name: clean,
        ...(category && { extraId: category }),
      }),
    );
  }

  async update(id: string, name: string, extraId?: string) {
    const clean = name.trim();
    this.assertId(id);
    await this.assertFree(clean, id);
    const category = await this.category(extraId);
    const t = await this.typeModel
      .findOneAndUpdate(
        { _id: id, deletedAt: { $exists: false } },
        {
          $set: { name: clean, ...(category && { extraId: category }) },
          ...(extraId === '' && { $unset: { extraId: 1 } }),
        },
        { new: true },
      )
      .exec();
    if (!t) throw new NotFoundException('Pieza no encontrada');
    return this.view(t);
  }

  /**
   * Importa el catálogo completo (categorías con sus precios + piezas con su
   * categoría). Busca por nombre sin mayúsculas ni tildes: lo que existe se
   * actualiza, lo que falta se crea, nada se borra. Las fichas ya cargadas no
   * cambian (guardan nombre y monto).
   */
  async importCatalog(dto: {
    categories: Array<{ name: string; amount: number; addAmount?: number; pair?: boolean; material?: string }>;
    types: Array<{ name: string; category: string }>;
  }) {
    const summary = { categoriesCreated: 0, categoriesUpdated: 0, typesCreated: 0, typesUpdated: 0 };
    const extras = await this.extraModel.find({ deletedAt: { $exists: false } }).exec();
    const extraByKey = new Map(extras.map((x) => [key(x.name), x]));
    for (const c of dto.categories) {
      const name = c.name.trim();
      const fields = {
        amount: c.amount,
        pair: !!c.pair,
        ...(c.addAmount != null ? { addAmount: c.addAmount } : {}),
        ...(c.material?.trim() ? { material: c.material.trim() } : {}),
      };
      const found = extraByKey.get(key(name));
      if (found) {
        await this.extraModel.updateOne(
          { _id: found._id },
          {
            $set: { name, ...fields },
            $unset: {
              ...(c.addAmount == null ? { addAmount: 1 } : {}),
              ...(c.material?.trim() ? {} : { material: 1 }),
            },
          },
        );
        summary.categoriesUpdated++;
      } else {
        const created = await this.extraModel.create({ name, ...fields });
        extraByKey.set(key(name), created);
        summary.categoriesCreated++;
      }
    }
    const types = await this.typeModel.find({ deletedAt: { $exists: false } }).exec();
    const typeByKey = new Map(types.map((t) => [key(t.name), t]));
    for (const t of dto.types) {
      const name = t.name.trim();
      const category = extraByKey.get(key(t.category));
      if (!category) {
        throw new BadRequestException(`La pieza "${name}" usa la categoría "${t.category}", que no está en la lista.`);
      }
      const found = typeByKey.get(key(name));
      if (found) {
        await this.typeModel.updateOne(
          { _id: found._id },
          { $set: { extraId: category._id } },
        );
        summary.typesUpdated++;
      } else {
        const created = await this.typeModel.create({ name, extraId: category._id });
        typeByKey.set(key(name), created);
        summary.typesCreated++;
      }
    }
    return summary;
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

  /** La categoría tiene que ser un adicional vigente del catálogo. */
  private async category(extraId?: string): Promise<Types.ObjectId | null> {
    if (!extraId) return null;
    this.assertId(extraId);
    const exists = await this.extraModel.exists({
      _id: extraId,
      deletedAt: { $exists: false },
    });
    if (!exists) {
      throw new BadRequestException('Esa categoría ya no existe. Elegí otra.');
    }
    return new Types.ObjectId(extraId);
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
