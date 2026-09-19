import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PieceDocument, ReservationDocument } from '../common/schemas';
import { Student, StudentDocument } from '../common/schemas/student.schema';
import { Group, GroupDocument } from '../common/schemas/group.schema';
import { ProfessorsService } from '../professors/professors.service';
import {
  PieceStatus,
  PieceStatusConfig,
  DEFAULT_PIECE_STATUS_CONFIG,
} from '../common/enums/piece.enum';
import {
  CreatePieceDto,
  CreateReservationPiecesDto,
  CreateGroupPiecesDto,
  UpdatePieceDto,
  ListPiecesQueryDto,
} from '../common/dto';
import { NotificationsService } from '../notifications/notifications.service';
import { envConfig } from '../config/env.config';
import { UserRole } from '../common/enums/user-role.enum';

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
export class PiecesService implements OnModuleInit {
  private readonly logger = new Logger(PiecesService.name);

  constructor(
    @InjectModel('Piece') private readonly pieceModel: Model<PieceDocument>,
    @InjectModel('Reservation')
    private readonly reservationModel: Model<ReservationDocument>,
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel(Group.name)
    private readonly groupModel: Model<GroupDocument>,
    private readonly notifications: NotificationsService,
    private readonly professors: ProfessorsService,
  ) {}

  async onModuleInit() {
    await this.pieceModel.updateMany(
      {
        status: {
          $in: [
            PieceStatus.SECADO,
            PieceStatus.PRIMERA_HORNEADA,
            PieceStatus.ESMALTADO,
            PieceStatus.SEGUNDA_HORNEADA,
          ],
        },
      },
      { $set: { status: PieceStatus.PENDIENTE } },
    );
  }

  // ── Estados configurables ────────────────────────────────────────────────

  private static readonly STATUSES_KEY = 'pieceStatuses';

  /** Estados vigentes (los del taller si los editó; si no, los default). */
  async statusConfig(): Promise<PieceStatusConfig[]> {
    return DEFAULT_PIECE_STATUS_CONFIG;
  }

  /**
   * Reemplaza los estados. Exige al menos uno, claves únicas y al menos un
   * estado con isReady (si no, nunca se dispararía el aviso de "lista").
   */
  async setStatusConfig(statuses: PieceStatusConfig[]) {
    void statuses;
    throw new BadRequestException(
      'El seguimiento de piezas ahora usa únicamente En preparación, Lista para retirar y Retirada.',
    );
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
    const status = dto.status ?? PieceStatus.PENDIENTE;
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

  async createReservationBatch(
    dto: CreateReservationPiecesDto,
    actor?: { id?: string; role?: string },
  ) {
    const reservation = await this.reservationModel
      .findOne({ _id: dto.reservationId, deletedAt: { $exists: false } })
      .select('code customerName customerPhone experienceName quantity startAt')
      .lean();
    if (!reservation) throw new BadRequestException('Reserva no encontrada');
    const professor = await this.professors.ofUser(actor?.id);
    const documents = dto.entries.map((entry) => ({
      reservationId: reservation._id,
      reservationCode: reservation.code,
      customerName: reservation.customerName,
      customerPhone: reservation.customerPhone ?? '',
      experienceName: reservation.experienceName,
      professorId: professor?._id,
      professorName: professor?.name,
      quantity: 1,
      status: PieceStatus.PENDIENTE,
      personName: entry.personName.trim(),
      signature: entry.signature.trim(),
      pieceType: entry.pieceType.trim(),
      colorsUsed: entry.colorsUsed.trim(),
      photos: [],
    }));
    return this.pieceModel.insertMany(documents);
  }

  /**
   * Carga piezas para alumnos de un grupo de taller: una ficha por alumno del
   * grupo. Cada pieza queda ligada al alumno (studentId), con el profesor del
   * grupo (o el que hace la carga) asignado al proceso.
   */
  async createGroupBatch(
    dto: CreateGroupPiecesDto,
    actor?: { id?: string; role?: string },
  ) {
    const group = await this.groupModel
      .findOne({ _id: dto.groupId, deletedAt: { $exists: false } })
      .select('name studentIds professorId professorName')
      .lean();
    if (!group) throw new BadRequestException('Grupo no encontrado');

    const memberIds = new Set((group.studentIds ?? []).map((id) => String(id)));
    const invalid = dto.entries
      .map((e) => e.studentId)
      .filter((id) => !memberIds.has(id));
    if (invalid.length) {
      throw new BadRequestException(
        'Hay alumnos que no pertenecen al grupo seleccionado.',
      );
    }

    const requested = dto.entries.map((e) => e.studentId);
    const students = await this.studentModel
      .find({ _id: { $in: requested }, deletedAt: { $exists: false } })
      .select('name phone')
      .lean();
    const byId = new Map(
      students.map((s) => [(s._id as Types.ObjectId).toHexString(), s]),
    );

    // Profesor del proceso: el del grupo si tiene; si no, el que hace la carga.
    const own = await this.professors.ofUser(actor?.id);
    const professorId = group.professorId ?? own?._id;
    const professorName = group.professorName ?? own?.name;

    const documents = dto.entries.map((entry) => {
      const s = byId.get(entry.studentId);
      return {
        studentId: new Types.ObjectId(entry.studentId),
        studentName: s?.name,
        customerName: s?.name,
        customerPhone: s?.phone ?? '',
        experienceName: group.name,
        professorId,
        professorName,
        quantity: 1,
        status: PieceStatus.PENDIENTE,
        personName: entry.personName.trim(),
        signature: entry.signature.trim(),
        pieceType: entry.pieceType.trim(),
        colorsUsed: entry.colorsUsed.trim(),
        photos: [],
      };
    });
    return this.pieceModel.insertMany(documents);
  }

  async list(query: ListPiecesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter = this.buildListFilter(query);
    if (query.status) filter.status = query.status;
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

  async counts(query: ListPiecesQueryDto) {
    const filter = this.buildListFilter(query);
    const rows = await this.pieceModel.aggregate<{
      _id: string;
      count: number;
    }>([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const byStatus = Object.fromEntries(
      rows.map((row) => [row._id, row.count]),
    );
    return {
      total: rows.reduce((sum, row) => sum + row.count, 0),
      byStatus,
    };
  }

  private buildListFilter(query: ListPiecesQueryDto): Record<string, any> {
    const filter: Record<string, any> = { deletedAt: { $exists: false } };
    if (query.professorId)
      filter.professorId = new Types.ObjectId(query.professorId);
    if (query.studentId) filter.studentId = new Types.ObjectId(query.studentId);
    const term = query.search?.trim();
    if (term) {
      const rx = new RegExp(escapeRegex(term), 'i');
      const or: Record<string, unknown>[] = [
        { personName: rx },
        { signature: rx },
        { pieceType: rx },
        { colorsUsed: rx },
        { customerName: rx },
        { experienceName: rx },
        { studentName: rx },
      ];
      const compact = term.replace(/[^a-zA-Z0-9]/g, '');
      if (compact)
        or.push({ customerPhone: new RegExp(escapeRegex(compact), 'i') });
      filter.$or = or;
    }
    return filter;
  }

  async update(
    id: string,
    dto: UpdatePieceDto,
    actor?: { id?: string; role?: string },
  ): Promise<PieceDocument> {
    const piece = await this.pieceModel.findOne({
      _id: id,
      deletedAt: { $exists: false },
    });
    if (!piece) throw new NotFoundException('Pieza no encontrada');

    if (actor?.role !== UserRole.ADMIN) {
      const changedFields = Object.keys(dto).filter(
        (key) => dto[key as keyof UpdatePieceDto] !== undefined,
      );
      // La profesora sólo marca "lista para retirar" y carga fotos; el resto
      // (retiro, datos de la ficha, aviso) queda para el admin.
      const allowed = changedFields.every(
        (key) =>
          key === 'photos' ||
          (key === 'status' && dto.status === PieceStatus.LISTA),
      );
      if (!changedFields.length || !allowed) {
        throw new BadRequestException(
          'La profesora sólo puede marcar una pieza como lista para retirar.',
        );
      }
    }

    if (dto.quantity != null) piece.quantity = dto.quantity;
    if (dto.personName != null) piece.personName = dto.personName.trim();
    if (dto.signature != null) piece.signature = dto.signature.trim();
    if (dto.pieceType != null) piece.pieceType = dto.pieceType.trim();
    if (dto.colorsUsed != null) piece.colorsUsed = dto.colorsUsed.trim();
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

    if (dto.status && dto.status !== piece.status) {
      const statusCfg = await this.assertValidStatus(dto.status);
      piece.status = dto.status;
      const now = new Date();
      if (statusCfg.isReady && !piece.readyAt) piece.readyAt = now;
      if (statusCfg.isFinal && !piece.pickedUpAt) piece.pickedUpAt = now;
    }

    await piece.save();

    return piece;
  }

  async notifyReadyByAdmin(id: string) {
    const piece = await this.pieceModel.findOne({
      _id: id,
      deletedAt: { $exists: false },
    });
    if (!piece) throw new NotFoundException('Pieza no encontrada');
    const status = await this.assertValidStatus(piece.status);
    if (!status.isReady) {
      throw new BadRequestException(
        'La pieza todavía no está lista para retirar.',
      );
    }
    if (piece.notifiedReadyAt) return piece;
    const sent = await this.notifyReady(piece);
    if (!sent) {
      throw new BadRequestException(
        'No se pudo enviar el aviso de retiro. Revisá el teléfono o la conexión de WhatsApp.',
      );
    }
    if (piece.reservationId && piece.notifiedReadyAt) {
      await this.pieceModel.updateMany(
        {
          reservationId: piece.reservationId,
          status: PieceStatus.LISTA,
          deletedAt: { $exists: false },
        },
        { $set: { notifiedReadyAt: piece.notifiedReadyAt } },
      );
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
  private async notifyReady(piece: PieceDocument): Promise<boolean> {
    const name = piece.customerName
      ? ` ${piece.customerName.split(' ')[0]}`
      : '';
    const exp = piece.experienceName ? ` de *${piece.experienceName}*` : '';
    const msg =
      `¡Hola${name}! Tus piezas${exp} ya están listas para retirar 🎨\n\n` +
      `Podés pasar por el local ${envConfig.pickupInfo}. ¡Te esperamos! 💛`;
    const ok = await this.notifications.notify(piece.customerPhone, msg);
    if (ok) {
      piece.notifiedReadyAt = new Date();
      await piece.save();
      return true;
    } else {
      this.logger.warn(
        `No se pudo avisar piezas listas a ***${piece.customerPhone.slice(-4)}`,
      );
      return false;
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
