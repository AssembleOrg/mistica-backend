import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import { envConfig } from '../config/env.config';
import { Reservation, ReservationDocument } from '../common/schemas/reservation.schema';
import { User, UserDocument } from '../common/schemas/user.schema';
import {
  KitchenProduction,
  KitchenProductionDocument,
} from './kitchen-production.schema';
import {
  CreateKitchenProductionDto,
  UpdateKitchenProductionDto,
} from './kitchen-production.dto';

type Actor = { id?: string; role?: string };

@Injectable()
export class KitchenProductionService {
  constructor(
    @InjectModel(KitchenProduction.name)
    private readonly model: Model<KitchenProductionDocument>,
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<ReservationDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  private view(p: KitchenProduction & { _id: unknown; createdAt?: Date }) {
    return {
      id: String(p._id),
      day: p.day,
      item: p.item,
      quantity: p.quantity,
      unit: p.unit,
      reservationId: p.reservationId ? String(p.reservationId) : undefined,
      reservationLabel: p.reservationLabel,
      note: p.note,
      byName: p.byName,
      createdAt: p.createdAt,
    };
  }

  /** "Stefanie · 15:30" para mostrar la reserva sin volver a buscarla. */
  private async reservationLabel(id: string): Promise<string> {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Reserva inválida');
    const r = await this.reservationModel
      .findOne({ _id: id, deletedAt: { $exists: false } })
      .select('customerName startAt')
      .lean();
    if (!r) throw new BadRequestException('Esa reserva no existe');
    const time = DateTime.fromJSDate(r.startAt).setZone(envConfig.timezone).toFormat('HH:mm');
    return [r.customerName?.trim(), time].filter(Boolean).join(' · ');
  }

  private async actorName(registeredBy: string | undefined, actor?: Actor) {
    const typed = registeredBy?.trim();
    if (typed) return typed;
    if (actor?.id && Types.ObjectId.isValid(actor.id)) {
      return (await this.userModel.findById(actor.id).select('name').lean())?.name;
    }
    return undefined;
  }

  async create(dto: CreateKitchenProductionDto, actor?: Actor) {
    const doc = await this.model.create({
      day: dto.day,
      item: dto.item.trim(),
      quantity: dto.quantity,
      unit: dto.unit?.trim() || undefined,
      ...(dto.reservationId && {
        reservationId: new Types.ObjectId(dto.reservationId),
        reservationLabel: await this.reservationLabel(dto.reservationId),
      }),
      note: dto.note?.trim() || undefined,
      userId:
        actor?.id && Types.ObjectId.isValid(actor.id)
          ? new Types.ObjectId(actor.id)
          : undefined,
      byName: await this.actorName(dto.registeredBy, actor),
    });
    return this.view(doc.toObject());
  }

  async update(id: string, dto: UpdateKitchenProductionDto) {
    const doc = await this.model.findOne({ _id: id, deletedAt: { $exists: false } });
    if (!doc) throw new NotFoundException('Registro no encontrado');
    if (dto.day != null) doc.day = dto.day;
    if (dto.item != null) {
      if (!dto.item.trim()) throw new BadRequestException('Poné qué se preparó');
      doc.item = dto.item.trim();
    }
    if (dto.quantity != null) doc.quantity = dto.quantity;
    if (dto.unit !== undefined) doc.unit = dto.unit.trim() || undefined;
    if (dto.note !== undefined) doc.note = dto.note.trim() || undefined;
    if (dto.registeredBy !== undefined) doc.byName = dto.registeredBy.trim() || doc.byName;
    if (dto.reservationId !== undefined) {
      if (dto.reservationId) {
        doc.reservationLabel = await this.reservationLabel(dto.reservationId);
        doc.reservationId = new Types.ObjectId(dto.reservationId);
      } else {
        doc.reservationId = undefined;
        doc.reservationLabel = undefined;
      }
    }
    await doc.save();
    return this.view(doc.toObject());
  }

  /** Lo producido entre dos días (inclusive), por día y en orden de carga. */
  async list(from: string, to: string, reservationId?: string) {
    const rows = await this.model
      .find({
        deletedAt: { $exists: false },
        day: { $gte: from, $lte: to },
        ...(reservationId && { reservationId: new Types.ObjectId(reservationId) }),
      })
      .sort({ day: -1, createdAt: 1, _id: 1 })
      .lean();
    return rows.map((r) => this.view(r));
  }

  /** Lo que más se anota, para sugerirlo al cargar (con su última unidad). */
  async suggestions() {
    const rows = await this.model
      .aggregate<{ _id: string; item: string; unit?: string; count: number }>([
        { $match: { deletedAt: { $exists: false } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: { $toLower: '$item' },
            item: { $first: '$item' },
            unit: { $first: '$unit' },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1, item: 1 } },
        { $limit: 60 },
      ])
      .exec();
    return rows.map((r) => ({ item: r.item, unit: r.unit ?? undefined }));
  }

  async remove(id: string) {
    const res = await this.model.updateOne(
      { _id: id, deletedAt: { $exists: false } },
      { $set: { deletedAt: new Date() } },
    );
    if (!res.matchedCount) throw new NotFoundException('Registro no encontrado');
    return { success: true };
  }
}
