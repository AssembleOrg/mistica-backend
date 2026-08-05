import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PieceDocument, ReservationDocument } from '../common/schemas';
import { ProfessorsService } from '../professors/professors.service';
import {
  PieceStatus,
  PIECE_STATUS_LABEL,
} from '../common/enums/piece.enum';
import {
  CreatePieceDto,
  UpdatePieceDto,
  ListPiecesQueryDto,
} from '../common/dto';
import { NotificationsService } from '../notifications/notifications.service';
import { envConfig } from '../config/env.config';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Núcleo del teléfono (sin código país 54 ni prefijo móvil 9). */
function phoneCore(raw: string): string {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('54')) d = d.slice(2);
  if (d.length > 10 && d.startsWith('9')) d = d.slice(1);
  return d;
}

@Injectable()
export class PiecesService {
  private readonly logger = new Logger(PiecesService.name);

  constructor(
    @InjectModel('Piece') private readonly pieceModel: Model<PieceDocument>,
    @InjectModel('Reservation')
    private readonly reservationModel: Model<ReservationDocument>,
    private readonly notifications: NotificationsService,
    private readonly professors: ProfessorsService,
  ) {}

  /**
   * Crea una pieza. Camino normal: asignada a una RESERVA, de la que salen el
   * contacto y la experiencia (no se retipea nada). El camino manual (teléfono
   * a mano) queda para piezas sin reserva (huérfanas, históricas).
   */
  async create(dto: CreatePieceDto): Promise<PieceDocument> {
    const now = new Date();
    const status = dto.status ?? PieceStatus.SECADO;

    let customerPhone = dto.customerPhone?.trim() ?? '';
    let customerName = dto.customerName?.trim();
    let experienceName = dto.experienceName?.trim();
    let reservationCode: string | undefined;

    if (dto.reservationId) {
      const r = await this.reservationModel
        .findOne({ _id: dto.reservationId, deletedAt: { $exists: false } })
        .select('code customerName customerPhone experienceName')
        .lean();
      if (!r) throw new BadRequestException('Reserva no encontrada');
      customerPhone = r.customerPhone ?? customerPhone;
      customerName = customerName ?? r.customerName;
      experienceName = experienceName ?? r.experienceName;
      reservationCode = r.code;
    } else if (!customerPhone) {
      throw new BadRequestException(
        'Asigná la pieza a una reserva o indicá el teléfono del cliente.',
      );
    }

    const professorName = dto.professorId
      ? await this.professors.nameOf(dto.professorId)
      : undefined;

    return this.pieceModel.create({
      customerPhone,
      customerName,
      experienceName,
      quantity: dto.quantity ?? 1,
      status,
      notes: dto.notes?.trim(),
      reservationId: dto.reservationId
        ? new Types.ObjectId(dto.reservationId)
        : undefined,
      reservationCode,
      professorId: dto.professorId
        ? new Types.ObjectId(dto.professorId)
        : undefined,
      professorName,
      readyAt: status === PieceStatus.LISTA ? now : undefined,
      pickedUpAt: status === PieceStatus.RETIRADA ? now : undefined,
    });
  }

  async list(query: ListPiecesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (query.status) filter.status = query.status;
    if (query.professorId)
      filter.professorId = new Types.ObjectId(query.professorId);
    const term = query.search?.trim();
    if (term) {
      const rx = new RegExp(escapeRegex(term), 'i');
      const or: Record<string, unknown>[] = [
        { customerName: rx },
        { experienceName: rx },
      ];
      const compact = term.replace(/[^a-zA-Z0-9]/g, '');
      if (compact) or.push({ customerPhone: new RegExp(escapeRegex(compact), 'i') });
      filter.$or = or;
    }
    const [items, total] = await Promise.all([
      this.pieceModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.pieceModel.countDocuments(filter),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async update(id: string, dto: UpdatePieceDto): Promise<PieceDocument> {
    const piece = await this.pieceModel.findOne({
      _id: id,
      deletedAt: { $exists: false },
    });
    if (!piece) throw new NotFoundException('Pieza no encontrada');

    if (dto.quantity != null) piece.quantity = dto.quantity;
    if (dto.customerName != null) piece.customerName = dto.customerName.trim();
    if (dto.experienceName != null)
      piece.experienceName = dto.experienceName.trim();
    if (dto.notes != null) piece.notes = dto.notes.trim();
    if (dto.professorId !== undefined) {
      if (dto.professorId) {
        piece.professorName = await this.professors.nameOf(dto.professorId);
        piece.professorId = new Types.ObjectId(dto.professorId);
      } else {
        piece.professorId = undefined;
        piece.professorName = undefined;
      }
    }

    if (dto.status && dto.status !== piece.status) {
      piece.status = dto.status;
      const now = new Date();
      if (dto.status === PieceStatus.LISTA && !piece.readyAt) piece.readyAt = now;
      if (dto.status === PieceStatus.RETIRADA && !piece.pickedUpAt)
        piece.pickedUpAt = now;
    }

    await piece.save();

    // Aviso de "lista" (idempotente): sólo la primera vez que queda LISTA.
    if (piece.status === PieceStatus.LISTA && !piece.notifiedReadyAt) {
      await this.notifyReady(piece);
    }
    return piece;
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const res = await this.pieceModel.updateOne(
      { _id: id, deletedAt: { $exists: false } },
      { $set: { deletedAt: new Date() } },
    );
    if (!res.matchedCount) throw new NotFoundException('Pieza no encontrada');
    return { success: true };
  }

  /** Aviso por WhatsApp de que las piezas están para retirar (una sola vez). */
  private async notifyReady(piece: PieceDocument): Promise<void> {
    const name = piece.customerName ? ` ${piece.customerName.split(' ')[0]}` : '';
    const exp = piece.experienceName ? ` de *${piece.experienceName}*` : '';
    const msg =
      `¡Hola${name}! Tus piezas${exp} ya están listas para retirar 🎨\n\n` +
      `Podés pasar por el local ${envConfig.pickupInfo}. ¡Te esperamos! 💛`;
    const ok = await this.notifications.notify(piece.customerPhone, msg);
    if (ok) {
      piece.notifiedReadyAt = new Date();
      await piece.save();
    } else {
      this.logger.warn(
        `No se pudo avisar piezas listas a ***${piece.customerPhone.slice(-4)}`,
      );
    }
  }

  /**
   * Piezas de un cliente por teléfono (uso interno del bot). Devuelve, por
   * pieza, el estado legible y si está lista/retirada. Match por los últimos 8
   * dígitos (tolerante al formato guardado).
   */
  async byPhone(phone: string) {
    const core = phoneCore(phone);
    if (core.length < 6) return { pieces: [] };
    const pattern = core.slice(-8).split('').join('\\D*');
    const docs = await this.pieceModel
      .find({
        deletedAt: { $exists: false },
        customerPhone: { $regex: pattern },
      })
      .sort({ createdAt: -1 })
      .lean();
    return {
      pieces: docs.map((p) => ({
        experiencia: p.experienceName || null,
        cantidad: p.quantity,
        estado: PIECE_STATUS_LABEL[p.status as PieceStatus] ?? p.status,
        lista: p.status === PieceStatus.LISTA,
        retirada: p.status === PieceStatus.RETIRADA,
      })),
      retiro: envConfig.pickupInfo,
    };
  }
}
