import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Group, GroupDocument } from '../common/schemas/group.schema';
import {
  Professor,
  ProfessorDocument,
} from '../common/schemas/professor.schema';
import { Student, StudentDocument } from '../common/schemas/student.schema';
import { Client, ClientDocument } from '../common/schemas/client.schema';
import { CreateGroupDto, UpdateGroupDto } from '../common/dto/group.dto';
import { UserRole } from '../common/enums/user-role.enum';
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
  constructor(
    @InjectModel(Group.name)
    private readonly groupModel: Model<GroupDocument>,
    @InjectModel(Professor.name)
    private readonly professorModel: Model<ProfessorDocument>,
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel(Client.name)
    private readonly clientModel: Model<ClientDocument>,
  ) {}

  private isAdmin(actor?: Actor): boolean {
    return actor?.role === UserRole.ADMIN;
  }

  /** Profesor vinculado a la cuenta que llama (o null si no es profesor). */
  private async professorOf(actor?: Actor): Promise<ProfessorDocument | null> {
    if (!actor?.id || !Types.ObjectId.isValid(actor.id)) return null;
    return this.professorModel
      .findOne({ userId: actor.id, deletedAt: { $exists: false } })
      .exec();
  }

  async list(actor?: Actor, includeInactive = false) {
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (!includeInactive) filter.isActive = true;
    // Un profesor ve sólo sus grupos; el admin (o cuentas de gestión) ve todos.
    if (!this.isAdmin(actor)) {
      const prof = await this.professorOf(actor);
      // Una cuenta sin profesor asociado no puede ver los grupos de otros.
      if (!prof) return [];
      filter.professorId = prof._id;
    }
    return this.groupModel.find(filter).sort({ name: 1 }).lean();
  }

  async create(dto: CreateGroupDto, actor?: Actor) {
    this.assertSingleSchedule(dto.schedule);
    const data: Record<string, unknown> = {
      name: dto.name,
      description: dto.description,
      schedule: dto.schedule ?? [],
      notes: dto.notes,
      isActive: dto.isActive ?? true,
    };

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
    return this.groupModel.create(data);
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
    if (dto.notes !== undefined) group.notes = dto.notes;
    if (dto.isActive !== undefined) group.isActive = dto.isActive;
    group.updatedAt = new Date();
    await group.save();
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
  async groupsOfStudent(studentId: string, actor?: Actor) {
    if (!Types.ObjectId.isValid(studentId)) return [];
    const filter: Record<string, unknown> = {
      studentIds: new Types.ObjectId(studentId),
      deletedAt: { $exists: false },
    };
    if (!this.isAdmin(actor)) {
      const prof = await this.professorOf(actor);
      if (!prof) return [];
      filter.professorId = prof._id;
    }
    return this.groupModel.find(filter).sort({ name: 1 }).lean();
  }

  /**
   * Clases que tienen los grupos ese día, con cuántos alumnos hay anotados.
   * Sin nombres: la usa cocina para saber cuánta gente viene al taller.
   */
  async dayAgenda(dateKey: string) {
    const weekday = DateTime.fromISO(dateKey, {
      zone: envConfig.timezone,
    }).weekday;
    if (!Number.isFinite(weekday))
      throw new BadRequestException('date debe ser YYYY-MM-DD');
    const groups = await this.groupModel
      .find({ deletedAt: { $exists: false }, isActive: true })
      .select('name schedule studentIds professorName')
      .lean();
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
      let student = await this.studentModel
        .findOne({ clientId: client._id, deletedAt: { $exists: false } })
        .exec();
      if (!student) {
        student = await this.studentModel.create({
          name: client.fullName,
          clientId: client._id,
          clientName: client.fullName,
          phone: client.phone,
          email: client.email,
        });
      } else if (!student.isActive) {
        student.isActive = true;
        student.updatedAt = new Date();
        await student.save();
      }
      ids.add(String(student._id));
    }
    return [...ids].map((id) => new Types.ObjectId(id));
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
