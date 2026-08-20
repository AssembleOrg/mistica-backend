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
import { CreateGroupDto, UpdateGroupDto } from '../common/dto/group.dto';
import { UserRole } from '../common/enums/user-role.enum';

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
      if (prof) filter.professorId = prof._id;
    }
    return this.groupModel.find(filter).sort({ name: 1 }).lean();
  }

  async create(dto: CreateGroupDto, actor?: Actor) {
    const data: Record<string, unknown> = {
      name: dto.name,
      description: dto.description,
      schedule: dto.schedule ?? [],
      studentIds: (dto.studentIds ?? []).map((id) => new Types.ObjectId(id)),
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

    return this.groupModel.create(data);
  }

  async update(id: string, dto: UpdateGroupDto, actor?: Actor) {
    const group = await this.findOrThrow(id);
    await this.assertCanManage(group, actor);

    if (dto.professorId !== undefined && this.isAdmin(actor)) {
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
    if (dto.schedule !== undefined) group.schedule = dto.schedule as never;
    if (dto.studentIds !== undefined)
      group.studentIds = dto.studentIds.map((s) => new Types.ObjectId(s));
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
  async groupsOfStudent(studentId: string) {
    if (!Types.ObjectId.isValid(studentId)) return [];
    return this.groupModel
      .find({
        studentIds: new Types.ObjectId(studentId),
        deletedAt: { $exists: false },
      })
      .sort({ name: 1 })
      .lean();
  }

  private async assertCanManage(group: GroupDocument, actor?: Actor) {
    if (this.isAdmin(actor)) return;
    const prof = await this.professorOf(actor);
    if (!prof || String(group.professorId) !== String(prof._id)) {
      throw new ForbiddenException('Sólo podés gestionar tus propios grupos.');
    }
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

  private async findOrThrow(id: string): Promise<GroupDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const group = await this.groupModel.findById(id).exec();
    if (!group || group.deletedAt)
      throw new NotFoundException('Grupo no encontrado');
    return group;
  }
}
