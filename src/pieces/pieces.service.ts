import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PieceDocument, ReservationDocument } from '../common/schemas';
import {
  AppSetting,
  AppSettingDocument,
} from '../common/schemas/app-setting.schema';
import {
  Student,
  StudentDocument,
} from '../common/schemas/student.schema';
import { ProfessorsService } from '../professors/professors.service';
import {
  PieceStatus,
  PieceStatusConfig,
  DEFAULT_PIECE_STATUS_CONFIG,
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
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel(AppSetting.name)
    private readonly settingModel: Model<AppSettingDocument>,
    private readonly notifications: NotificationsService,
    private readonly professors: ProfessorsService,
  ) {}

  // ── Estados configurables ────────────────────────────────────────────────

  private static readonly STATUSES_KEY = 'pieceStatuses';

  /** Estados vigentes (los del taller si los editó; si no, los default). */
  async statusConfig(): Promise<PieceStatusConfig[]> {
    const doc = await this.settingModel
      .findOne({ key: PiecesService.STATUSES_KEY })
      .lean();
    if (!doc?.value) return DEFAULT_PIECE_STATUS_CONFIG;
    try {
      const parsed = JSON.parse(doc.value) as PieceStatusConfig[];
      return parsed.length ? parsed : DEFAULT_PIECE_STATUS_CONFIG;
    } catch {
      return DEFAULT_PIECE_STATUS_CONFIG;
    }
  }

  /**
   * Reemplaza los estados. Exige al menos uno, claves únicas y al menos un
   * estado con isReady (si no, nunca se dispararía el aviso de "lista").
   */
  async setStatusConfig(statuses: PieceStatusConfig[]) {
    const clean = statuses
      .map((s) => ({
        key: s.key
          .trim()
          .toUpperCase()
          .normalize('NFKD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^A-Z0-9]+/g, '_')
          .replace(/^_+|_+$/g, ''),
        label: s.label.trim(),
        isReady: !!s.isReady,
        isFinal: !!s.isFinal,
      }))
      .filter((s) => s.key && s.label);
    if (!clean.length)
      throw new BadRequestException('Tiene que quedar al menos un estado.');
    const keys = new Set(clean.map((s) => s.key));
    if (keys.size !== clean.length)
      throw new BadRequestException('Hay estados con la misma clave.');
    if (!clean.some((s) => s.isReady))
      throw new BadRequestException(
        'Marcá al menos un estado como "lista para retirar": es el que dispara el aviso al cliente.',
      );
    await this.settingModel.updateOne(
      { key: PiecesService.STATUSES_KEY },
      { $set: { value: JSON.stringify(clean) } },
      { upsert: true },
    );
    return clean;
  }

  private async assertValidStatus(status: string) {
    const config = await this.statusConfig();
    if (!config.some((s) => s.key === status)) {
      throw new BadRequestException(
        `Estado desconocido: ${status}. Estados vigentes: ${config
          .map((s) => s.key)
          .join(', ')}.`,
      );
    }
    return config.find((s) => s.key === status)!;
  }

  /**
   * Crea una pieza. Camino normal: asignada a una RESERVA, de la que salen el
   * contacto y la experiencia (no se retipea nada). El camino manual (teléfono
   * a mano) queda para piezas sin reserva (huérfanas, históricas).
   */
  async create(dto: CreatePieceDto): Promise<PieceDocument> {
    const now = new Date();
    const status = dto.status ?? PieceStatus.SECADO;
    const statusCfg = await this.assertValidStatus(status);

    let customerPhone = dto.customerPhone?.trim() ?? '';
    let customerName = dto.customerName?.trim();
    let experienceName = dto.experienceName?.trim();
    let reservationCode: string | undefined;
    let studentName: string | undefined;

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
    } else if (dto.studentId) {
      // Pieza de ALUMNO del taller: contacto desde su ficha (el aviso de
      // "lista" le llega a él o al adulto responsable).
      const s = await this.studentModel
        .findOne({ _id: dto.studentId, deletedAt: { $exists: false } })
        .select('name phone')
        .lean();
      if (!s) throw new BadRequestException('Alumno no encontrado');
      studentName = s.name;
      customerPhone = customerPhone || (s.phone ?? '');
      customerName = customerName ?? s.name;
    } else if (!customerPhone) {
      throw new BadRequestException(
        'Asigná la pieza a una reserva o a un alumno, o indicá el teléfono del cliente.',
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
      photos: dto.photos ?? [],
      reservationId: dto.reservationId
        ? new Types.ObjectId(dto.reservationId)
        : undefined,
      reservationCode,
      studentId: dto.studentId ? new Types.ObjectId(dto.studentId) : undefined,
      studentName,
      professorId: dto.professorId
        ? new Types.ObjectId(dto.professorId)
        : undefined,
      professorName,
      readyAt: statusCfg.isReady ? now : undefined,
      pickedUpAt: statusCfg.isFinal ? now : undefined,
    });
  }

  async list(query: ListPiecesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (query.status) filter.status = query.status;
    if (query.professorId)
      filter.professorId = new Types.ObjectId(query.professorId);
    if (query.studentId)
      filter.studentId = new Types.ObjectId(query.studentId);
    const term = query.search?.trim();
    if (term) {
      const rx = new RegExp(escapeRegex(term), 'i');
      const or: Record<string, unknown>[] = [
        { customerName: rx },
        { experienceName: rx },
        { studentName: rx },
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
    if (dto.photos !== undefined) piece.photos = dto.photos;
    if (dto.professorId !== undefined) {
      if (dto.professorId) {
        piece.professorName = await this.professors.nameOf(dto.professorId);
        piece.professorId = new Types.ObjectId(dto.professorId);
      } else {
        piece.professorId = undefined;
        piece.professorName = undefined;
      }
    }
    if (dto.studentId !== undefined) {
      if (dto.studentId) {
        const s = await this.studentModel
          .findOne({ _id: dto.studentId, deletedAt: { $exists: false } })
          .select('name phone')
          .lean();
        if (!s) throw new BadRequestException('Alumno no encontrado');
        piece.studentId = new Types.ObjectId(dto.studentId);
        piece.studentName = s.name;
        if (!piece.customerPhone && s.phone) piece.customerPhone = s.phone;
      } else {
        piece.studentId = undefined;
        piece.studentName = undefined;
      }
    }

    let becameReady = false;
    if (dto.status && dto.status !== piece.status) {
      const statusCfg = await this.assertValidStatus(dto.status);
      piece.status = dto.status;
      const now = new Date();
      if (statusCfg.isReady && !piece.readyAt) piece.readyAt = now;
      if (statusCfg.isFinal && !piece.pickedUpAt) piece.pickedUpAt = now;
      becameReady = !!statusCfg.isReady;
    }

    await piece.save();

    // Aviso de "lista" (idempotente): sólo la primera vez que entra a un
    // estado marcado isReady.
    if (becameReady && !piece.notifiedReadyAt) {
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
    const [docs, config] = await Promise.all([
      this.pieceModel
        .find({
          deletedAt: { $exists: false },
          customerPhone: { $regex: pattern },
        })
        .sort({ createdAt: -1 })
        .lean(),
      this.statusConfig(),
    ]);
    const cfgOf = new Map(config.map((s) => [s.key, s]));
    return {
      pieces: docs.map((p) => {
        const cfg = cfgOf.get(p.status);
        return {
          experiencia: p.experienceName || null,
          cantidad: p.quantity,
          estado: cfg?.label ?? p.status,
          lista: !!cfg?.isReady,
          retirada: !!cfg?.isFinal,
        };
      }),
      retiro: envConfig.pickupInfo,
    };
  }
}
