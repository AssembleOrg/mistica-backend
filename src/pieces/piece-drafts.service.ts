import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PieceDraft,
  PieceDraftDocument,
  PieceDraftEntry,
} from '../common/schemas/piece-draft.schema';
import { PieceDocument } from '../common/schemas';
import {
  DRAFT_KEY_RE,
  SavePieceDraftEntryDto,
} from '../common/dto/piece.dto';

const TEXT_FIELDS = ['personName', 'signature', 'pieceType', 'colorsUsed'] as const;

/** Una ficha con algo escrito (las vacías son de alguien que no vino). */
export const hasContent = (e: Partial<PieceDraftEntry>) =>
  TEXT_FIELDS.some((f) => !!e[f]?.trim());

/**
 * Borradores de fichas de piezas por reserva: se guardan ficha por ficha
 * mientras se escribe y se comparten entre dispositivos.
 */
@Injectable()
export class PieceDraftsService {
  constructor(
    @InjectModel(PieceDraft.name)
    private readonly draftModel: Model<PieceDraftDocument>,
    @InjectModel('Piece') private readonly pieceModel: Model<PieceDocument>,
  ) {}

  private oid(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Reserva inválida');
    return new Types.ObjectId(id);
  }

  private key(key: string) {
    if (!DRAFT_KEY_RE.test(key)) throw new BadRequestException('Ficha inválida');
    return key;
  }

  /** Las fichas del borrador (en orden) y cuántas ya se registraron. */
  async get(reservationId: string) {
    const rid = this.oid(reservationId);
    const [draft, registered, registeredIncluded] = await Promise.all([
      this.draftModel.findOne({ reservationId: rid }).lean(),
      this.pieceModel.countDocuments({ reservationId: rid, deletedAt: { $exists: false } }),
      this.pieceModel.countDocuments({
        reservationId: rid,
        deletedAt: { $exists: false },
        additional: { $ne: true },
      }),
    ]);
    const entries = Object.entries(draft?.entries ?? {})
      .map(([key, e]) => ({ key, ...e }))
      .sort((a, b) => a.order - b.order);
    return { entries, registered, registeredIncluded };
  }

  /** Guarda (o crea) una ficha del borrador. */
  async save(
    reservationId: string,
    key: string,
    dto: SavePieceDraftEntryDto,
    actorName?: string,
  ) {
    const entry: PieceDraftEntry = {
      personName: dto.personName ?? '',
      signature: dto.signature ?? '',
      pieceType: dto.pieceType ?? '',
      colorsUsed: dto.colorsUsed ?? '',
      hasExtra: !!dto.hasExtra,
      extraId: dto.extraId ?? '',
      pieceType2: dto.pieceType2 ?? '',
      additional: !!dto.additional,
      order: dto.order,
      updatedBy: dto.updatedBy?.trim() || actorName,
      updatedAt: new Date(),
    };
    await this.draftModel.updateOne(
      { reservationId: this.oid(reservationId) },
      { $set: { [`entries.${this.key(key)}`]: entry } },
      { upsert: true },
    );
    return { key, ...entry };
  }

  /** Saca fichas del borrador (Quitar, o ya registradas). */
  async remove(reservationId: string, keys: string[]) {
    if (!keys.length) return { success: true };
    const unset = Object.fromEntries(keys.map((k) => [`entries.${this.key(k)}`, '']));
    await this.draftModel.updateOne(
      { reservationId: this.oid(reservationId) },
      { $unset: unset },
    );
    return { success: true };
  }

  /** Cuántas fichas sin terminar tiene cada reserva (sólo las que tienen). */
  async pending(reservationIds: string[]) {
    const ids = reservationIds.filter((id) => Types.ObjectId.isValid(id)).slice(0, 500);
    if (!ids.length) return [];
    const drafts = await this.draftModel
      .find({ reservationId: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .lean();
    return drafts
      .map((d) => ({
        reservationId: String(d.reservationId),
        pending: Object.values(d.entries ?? {}).filter(hasContent).length,
      }))
      .filter((d) => d.pending > 0);
  }
}
