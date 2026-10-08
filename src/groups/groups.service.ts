import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Group,
  GroupDocument,
  takesMonthlyPiece,
} from '../common/schemas/group.schema';
import {
  Professor,
  ProfessorDocument,
} from '../common/schemas/professor.schema';
import { Student, StudentDocument } from '../common/schemas/student.schema';
import { Client, ClientDocument } from '../common/schemas/client.schema';
import { CreateGroupDto, UpdateGroupDto } from '../common/dto/group.dto';
import {
  Reservation,
  ReservationDocument,
} from '../common/schemas/reservation.schema';
import {
  MakeupClass,
  MakeupClassDocument,
} from '../common/schemas/makeup-class.schema';
import { ReservationStatus } from '../common/enums/reservation.enum';
import {
  ExtraClass,
  ExtraClassDocument,
} from '../common/schemas/extra-class.schema';

type GroupRow = { name: string; sortOrder?: number; hasMonthlyPiece?: boolean };

/** Orden del admin (sortOrder); los que no tienen, al final por nombre. */
function byListOrder(a: GroupRow, b: GroupRow) {
  const oa = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const ob = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
  return oa - ob || a.name.localeCompare(b.name, 'es');
}

/** Ordena y deja explícito si el grupo lleva pieza del mes. */
function forList<T extends GroupRow>(rows: T[]) {
  return [...rows]
    .sort(byListOrder)
    .map((g) => ({ ...g, hasMonthlyPiece: takesMonthlyPiece(g) }));
}
import { UserRole, canManage } from '../common/enums/user-role.enum';
import {
  TrialClass,
  TrialClassDocument,
} from '../common/schemas/trial-class.schema';
import { DateTime } from 'luxon';
import { envConfig } from '../config/env.config';

export interface Actor {
  id: string;
  role?: UserRole | string;
}

/**
 * Grupos / talleres / clases. El ADMIN gestiona todos; un PROFESOR (cuenta
 * común vinculada a un Professor por userId) crea y administra los SUYOS:
 * al crear, el grupo queda a su nombre; al editar/borrar sólo puede tocar
 * los propios.
 */
@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    @InjectModel(Group.name)
    private readonly groupModel: Model<GroupDocument>,
    @InjectModel(Professor.name)
    private readonly professorModel: Model<ProfessorDocument>,
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel(Client.name)
    private readonly clientModel: Model<ClientDocument>,
    @InjectModel(TrialClass.name)
    private readonly trialModel: Model<TrialClassDocument>,
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<ReservationDocument>,
    @InjectModel(MakeupClass.name)
    private readonly makeupModel: Model<MakeupClassDocument>,
    @InjectModel(ExtraClass.name)
    private readonly extraModel: Model<ExtraClassDocument>,
  ) {}

  /** Admin o encargado: gestionan todos los grupos. */
  private isAdmin(actor?: Actor): boolean {
    return canManage(actor?.role);
  }

  /** Profesor vinculado a la cuenta que llama (o null si no es profesor). */
  private async professorOf(actor?: Actor): Promise<ProfessorDocument | null> {
    if (!actor?.id || !Types.ObjectId.isValid(actor.id)) return null;
    return this.professorModel
      .findOne({ userId: actor.id, deletedAt: { $exists: false } })
      .exec();
  }

  /**
   * Todos los grupos: cualquier cuenta con la vista los ve (las profes y la
   * compu necesitan saber quién va a cada clase). Editar sigue siendo del
   * admin/encargado o de la profe del grupo.
   */
  async list(includeInactive = false) {
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (!includeInactive) filter.isActive = true;
    return forList(await this.groupModel.find(filter).lean());
  }

  /** Guarda el orden del listado (el admin lo acomoda arrastrando). */
  async reorder(ids: string[]) {
    await this.groupModel.bulkWrite(
      ids.map((id, i) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(id) },
          update: { $set: { sortOrder: i } },
        },
      })),
    );
    return { success: true };
  }

  async create(dto: CreateGroupDto, actor?: Actor) {
    this.assertSingleSchedule(dto.schedule);
    const data: Record<string, unknown> = {
      name: dto.name,
      description: dto.description,
      schedule: dto.schedule ?? [],
      notes: dto.notes,
      isActive: dto.isActive ?? true,
      ...(dto.hasMonthlyPiece !== undefined && {
        hasMonthlyPiece: dto.hasMonthlyPiece,
      }),
    };
    if (dto.experienceIds?.length) {
      data.experienceIds = await this.resolveExperienceIds(dto.experienceIds);
    }
    // Un grupo nuevo va al final del orden del admin.
    const last = await this.groupModel
      .findOne({ deletedAt: { $exists: false }, sortOrder: { $exists: true } })
      .sort({ sortOrder: -1 })
      .select('sortOrder')
      .lean();
    if (last?.sortOrder != null) data.sortOrder = last.sortOrder + 1;

    if (this.isAdmin(actor)) {
      if (dto.professorId) {
        const prof = await this.findProfessor(dto.professorId);
        data.professorId = prof._id;
        data.professorName = prof.name;
      }
    } else {
      // Un profesor siempre crea grupos A SU NOMBRE.
      const prof = await this.professorOf(actor);
      if (!prof) {
        throw new ForbiddenException(
          'Tu cuenta no está vinculada a un profesor: pedile al admin que la vincule.',
        );
      }
      data.professorId = prof._id;
      data.professorName = prof.name;
    }

    // Después de validar permisos: puede dar de alta alumnos.
    data.studentIds = await this.resolveStudentIds(
      dto.studentIds ?? [],
      dto.clientIds,
    );
    const created = await this.groupModel.create(data);
    if (dto.experienceIds?.length) {
      await this.enrollUpcomingReservations(dto.experienceIds);
    }
    return created;
  }

  async update(id: string, dto: UpdateGroupDto, actor?: Actor) {
    const group = await this.findOrThrow(id);
    await this.assertCanManage(group, actor);

    // Sólo si cambia: el form reenvía el profesor actual, que pudo ser eliminado.
    const professorChanged =
      dto.professorId !== undefined &&
      dto.professorId !== String(group.professorId ?? '');
    if (professorChanged && this.isAdmin(actor)) {
      if (dto.professorId) {
        const prof = await this.findProfessor(dto.professorId);
        group.professorId = prof._id as Types.ObjectId;
        group.professorName = prof.name;
      } else {
        group.professorId = undefined;
        group.professorName = undefined;
      }
    }
    if (dto.name !== undefined) group.name = dto.name;
    if (dto.description !== undefined) group.description = dto.description;
    if (dto.schedule !== undefined) {
      this.assertSingleSchedule(dto.schedule);
      group.schedule = dto.schedule as never;
    }
    if (dto.studentIds !== undefined || dto.clientIds?.length) {
      group.studentIds = await this.resolveStudentIds(
        dto.studentIds ?? group.studentIds.map(String),
        dto.clientIds,
      );
    }
    let linked: string[] = [];
    if (dto.experienceIds !== undefined) {
      const before = new Set((group.experienceIds ?? []).map(String));
      group.experienceIds = await this.resolveExperienceIds(
        dto.experienceIds,
        String(group._id),
      );
      linked = dto.experienceIds.filter((id) => !before.has(id));
    }
    if (dto.notes !== undefined) group.notes = dto.notes;
    if (dto.isActive !== undefined) group.isActive = dto.isActive;
    if (dto.hasMonthlyPiece !== undefined)
      group.hasMonthlyPiece = dto.hasMonthlyPiece;
    group.updatedAt = new Date();
    await group.save();
    // Recién vinculada: los que ya reservaron para hoy en adelante se suman.
    if (linked.length) await this.enrollUpcomingReservations(linked);
    return group;
  }

  async remove(id: string, actor?: Actor) {
    const group = await this.findOrThrow(id);
    await this.assertCanManage(group, actor);
    group.deletedAt = new Date();
    group.isActive = false;
    await group.save();
    return { success: true };
  }

  /** Grupos en los que cursa un alumno (para su ficha). */
  async groupsOfStudent(studentId: string) {
    if (!Types.ObjectId.isValid(studentId)) return [];
    const filter: Record<string, unknown> = {
      studentIds: new Types.ObjectId(studentId),
      deletedAt: { $exists: false },
    };
    return forList(await this.groupModel.find(filter).lean());
  }

  /**
   * Clases que tienen los grupos ese día, con cuántos alumnos hay anotados y
   * cuántos vienen a una clase de prueba. Sin nombres: la usa cocina para
   * saber cuánta gente viene al taller.
   */
  async dayAgenda(dateKey: string) {
    const weekday = DateTime.fromISO(dateKey, {
      zone: envConfig.timezone,
    }).weekday;
    if (!Number.isFinite(weekday))
      throw new BadRequestException('date debe ser YYYY-MM-DD');
    const [groups, trials, makeups, extras] = await Promise.all([
      this.groupModel
        .find({ deletedAt: { $exists: false }, isActive: true })
        .select('name schedule studentIds professorName experienceIds')
        .lean(),
      this.trialModel.find({ date: dateKey }).select('groupId').lean(),
      this.makeupModel
        .find({ $or: [{ toDate: dateKey }, { fromDate: dateKey }] })
        .select('fromGroupId fromDate toGroupId toDate')
        .lean(),
      this.extraModel.find({ date: dateKey }).select('groupId').lean(),
    ]);
    const count = (ids: unknown[]) => {
      const m = new Map<string, number>();
      for (const id of ids) m.set(String(id), (m.get(String(id)) ?? 0) + 1);
      return m;
    };
    const trialsOf = count(trials.map((t) => t.groupId));
    // Vienen a recuperar / avisaron que no vienen (recuperan otro día).
    const makeupsOf = count(
      makeups.filter((m) => m.toDate === dateKey).map((m) => m.toGroupId),
    );
    const extrasOf = count(extras.map((x) => x.groupId));
    const awayOf = count(
      makeups.filter((m) => m.fromDate === dateKey).map((m) => m.fromGroupId),
    );
    return groups
      .filter((g) => (g.schedule ?? []).some((slot) => slot.weekday === weekday))
      .map((g) => {
        const slot = (g.schedule ?? []).find((sl) => sl.weekday === weekday);
        return {
          groupId: String(g._id),
          name: g.name,
          professorName: g.professorName,
          start: slot?.start ?? '',
          end: slot?.end ?? '',
          students: g.studentIds?.length ?? 0,
          trials: trialsOf.get(String(g._id)) ?? 0,
          makeups: makeupsOf.get(String(g._id)) ?? 0,
          away: awayOf.get(String(g._id)) ?? 0,
          // Alumnos de otros grupos que suman esta clase (doble turno).
          extras: extrasOf.get(String(g._id)) ?? 0,
          // Sus reservas se muestran acá, no como un turno aparte.
          experienceIds: (g.experienceIds ?? []).map(String),
        };
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  private async assertCanManage(group: GroupDocument, actor?: Actor) {
    if (this.isAdmin(actor)) return;
    const prof = await this.professorOf(actor);
    if (!prof || String(group.professorId) !== String(prof._id)) {
      throw new ForbiddenException('Sólo podés gestionar tus propios grupos.');
    }
  }

  /**
   * Alumnos finales del grupo: los elegidos + el de cada cliente agregado. Si
   * el cliente todavía no es alumno se lo da de alta vinculado (clientId); si
   * estaba dado de baja, vuelve a quedar activo.
   */
  private async resolveStudentIds(
    studentIds: string[],
    clientIds: string[] = [],
  ): Promise<Types.ObjectId[]> {
    const ids = new Set(studentIds);
    const wanted = [...new Set(clientIds)];
    // Se validan todos antes de crear nada: un id malo no deja altas a medias.
    const clients = await this.clientModel
      .find({ _id: { $in: wanted }, deletedAt: { $exists: false } })
      .exec();
    if (clients.length !== wanted.length)
      throw new NotFoundException('Cliente no encontrado');

    for (const client of clients) {
      const student = await this.studentOfClient(client);
      ids.add(String(student._id));
    }
    return [...ids].map((id) => new Types.ObjectId(id));
  }

  /**
   * Alumno de un cliente: el vinculado o uno nuevo con sus datos. Si estaba
   * dado de baja, vuelve a quedar activo.
   */
  private async studentOfClient(
    client: ClientDocument,
    joinedAt?: Date,
  ): Promise<StudentDocument> {
    const student = await this.studentModel
      .findOne({ clientId: client._id, deletedAt: { $exists: false } })
      .exec();
    if (!student) {
      return this.studentModel.create({
        name: client.fullName,
        clientId: client._id,
        clientName: client.fullName,
        phone: client.phone,
        email: client.email,
        ...(joinedAt && { joinedAt }),
      });
    }
    if (!student.isActive) {
      student.isActive = true;
      student.updatedAt = new Date();
      await student.save();
    }
    return student;
  }

  /**
   * Experiencias que van a este grupo. Una experiencia va a un solo grupo:
   * si ya está en otro, avisa en vez de moverla en silencio.
   */
  private async resolveExperienceIds(ids: string[], groupId?: string) {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const taken = await this.groupModel
      .findOne({
        experienceIds: { $in: unique.map((id) => new Types.ObjectId(id)) },
        deletedAt: { $exists: false },
        ...(groupId && { _id: { $ne: new Types.ObjectId(groupId) } }),
      })
      .select('name')
      .lean();
    if (taken) {
      throw new BadRequestException(
        `Esa experiencia ya va al grupo ${taken.name}: sacala de ahí primero.`,
      );
    }
    return unique.map((id) => new Types.ObjectId(id));
  }

  /**
   * Reserva confirmada de una experiencia que va a un grupo (Escuelita): quien
   * reservó queda como alumno del grupo, así aparece en su lista y en su
   * asistencia. Nunca lanza: un error acá no tiene que tumbar la reserva.
   */
  async enrollFromReservation(reservationId: unknown): Promise<void> {
    try {
      const r = await this.reservationModel
        .findById(reservationId)
        .select(
          'status experienceId clientId customerName customerPhone customerEmail startAt enrolledStudentId',
        )
        .lean();
      if (!r || r.status !== ReservationStatus.CONFIRMED || r.enrolledStudentId)
        return;
      const group = await this.groupModel
        .findOne({ experienceIds: r.experienceId, deletedAt: { $exists: false } })
        .select('name studentIds')
        .lean();
      if (!group) return;
      const client = await this.clientForReservation(r);
      const student = await this.studentOfClient(client, r.startAt);
      const already = (group.studentIds ?? []).some(
        (id) => String(id) === String(student._id),
      );
      if (!already) {
        await this.groupModel.updateOne(
          { _id: group._id },
          { $addToSet: { studentIds: student._id } },
        );
      }
      await this.reservationModel.updateOne(
        { _id: r._id },
        {
          $set: {
            enrolledGroupId: group._id,
            enrolledStudentId: student._id,
            ...(!already && { addedToGroup: true }),
          },
        },
      );
      if (!already) {
        this.logger.log(`${student.name} sumado a ${group.name} por su reserva`);
      }
    } catch (err) {
      this.logger.error(
        `No se pudo sumar al grupo la reserva ${String(reservationId)}: ${String(err)}`,
      );
    }
  }

  /**
   * Se canceló una reserva que había sumado a alguien al grupo: sale del grupo
   * (salvo que otra reserva confirmada lo mantenga). Nunca lanza.
   */
  async releaseFromReservation(reservationId: unknown): Promise<void> {
    try {
      const r = await this.reservationModel
        .findById(reservationId)
        .select('enrolledGroupId enrolledStudentId addedToGroup')
        .lean();
      if (!r?.enrolledGroupId || !r.enrolledStudentId) return;
      if (r.addedToGroup) {
        const other = await this.reservationModel.exists({
          _id: { $ne: r._id },
          enrolledGroupId: r.enrolledGroupId,
          enrolledStudentId: r.enrolledStudentId,
          status: ReservationStatus.CONFIRMED,
        });
        if (!other) {
          await this.groupModel.updateOne(
            { _id: r.enrolledGroupId },
            { $pull: { studentIds: r.enrolledStudentId } },
          );
        }
      }
      await this.reservationModel.updateOne(
        { _id: r._id },
        { $unset: { enrolledGroupId: 1, enrolledStudentId: 1, addedToGroup: 1 } },
      );
    } catch (err) {
      this.logger.error(
        `No se pudo sacar del grupo la reserva ${String(reservationId)}: ${String(err)}`,
      );
    }
  }

  /** Al vincular una experiencia: suma a los que ya reservaron de hoy en adelante. */
  private async enrollUpcomingReservations(experienceIds: string[]) {
    const today = DateTime.now().setZone(envConfig.timezone).startOf('day');
    const rows = await this.reservationModel
      .find({
        experienceId: { $in: experienceIds.map((id) => new Types.ObjectId(id)) },
        status: ReservationStatus.CONFIRMED,
        startAt: { $gte: today.toJSDate() },
        enrolledStudentId: { $exists: false },
      })
      .select('_id')
      .limit(200)
      .lean();
    for (const r of rows) await this.enrollFromReservation(r._id);
  }

  /**
   * Cliente de quien reservó: el vinculado a la reserva, el que tiene su mismo
   * teléfono o, si no hay, uno nuevo con sus datos (todo alumno es cliente).
   */
  private async clientForReservation(r: {
    clientId?: Types.ObjectId;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
  }): Promise<ClientDocument> {
    if (r.clientId) {
      const linked = await this.clientModel
        .findOne({ _id: r.clientId, deletedAt: { $exists: false } })
        .exec();
      if (linked) return linked;
    }
    const digits = (r.customerPhone ?? '').replace(/\D/g, '').slice(-8);
    if (digits.length === 8) {
      const same = await this.clientModel
        .find({
          deletedAt: { $exists: false },
          phone: { $regex: `${digits.split('').join('\\D*')}$` },
        })
        .limit(2)
        .exec();
      if (same.length === 1) return same[0];
    }
    return this.clientModel.create({
      fullName: r.customerName,
      phone: r.customerPhone || undefined,
      email: r.customerEmail || undefined,
    });
  }

  private async findProfessor(id: string): Promise<ProfessorDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('professorId inválido');
    const prof = await this.professorModel
      .findOne({ _id: id, deletedAt: { $exists: false } })
      .exec();
    if (!prof) throw new NotFoundException('Profesor no encontrado');
    return prof;
  }

  private assertSingleSchedule(
    schedule?: Array<{ start: string; end: string }>,
  ) {
    if (!schedule || schedule.length !== 1) {
      throw new BadRequestException(
        'El grupo debe tener un único día y horario.',
      );
    }
    if (schedule[0].start >= schedule[0].end) {
      throw new BadRequestException(
        'La hora de fin debe ser posterior a la hora de inicio.',
      );
    }
  }

  private async findOrThrow(id: string): Promise<GroupDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const group = await this.groupModel.findById(id).exec();
    if (!group || group.deletedAt)
      throw new NotFoundException('Grupo no encontrado');
    return group;
  }
}
