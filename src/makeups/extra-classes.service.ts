import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import { Group, GroupDocument } from '../common/schemas/group.schema';
import {
  ExtraClass,
  ExtraClassDocument,
} from '../common/schemas/extra-class.schema';
import { Student, StudentDocument } from '../common/schemas/student.schema';
import { User, UserDocument } from '../common/schemas/user.schema';
import {
  ListExtraClassesQueryDto,
  ScheduleExtraClassDto,
} from '../common/dto/makeup.dto';
import { envConfig } from '../config/env.config';

type ExtraRow = {
  _id: Types.ObjectId;
  studentId: Types.ObjectId;
  groupId: Types.ObjectId;
  date: string;
  notes?: string;
  createdByName?: string;
};

function ddmm(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${d}/${m}`;
}

/**
 * Clases extra: un alumno suma una clase en otro grupo además de la suya (un
 * doble turno). Se agendan en el momento, también para clases que todavía no
 * pasaron, y aparecen en la lista de esa clase.
 */
@Injectable()
export class ExtraClassesService {
  constructor(
    @InjectModel(ExtraClass.name)
    private readonly extraModel: Model<ExtraClassDocument>,
    @InjectModel(Group.name)
    private readonly groupModel: Model<GroupDocument>,
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async list(query: ListExtraClassesQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.groupId) filter.groupId = new Types.ObjectId(query.groupId);
    if (query.date) filter.date = query.date;
    if (query.studentId) filter.studentId = new Types.ObjectId(query.studentId);
    if (!filter.groupId && !filter.studentId) {
      throw new BadRequestException('Indicá el grupo o el alumno.');
    }
    const rows = await this.extraModel
      .find(filter)
      .sort({ date: -1 })
      .limit(200)
      .lean<ExtraRow[]>();
    return this.views(rows);
  }

  async schedule(dto: ScheduleExtraClassDto, actor?: { id?: string }) {
    const [student, group] = await Promise.all([
      this.studentModel
        .findOne({ _id: dto.studentId, deletedAt: { $exists: false } })
        .select('name')
        .lean(),
      this.groupModel
        .findOne({ _id: dto.groupId, deletedAt: { $exists: false } })
        .select('name schedule studentIds isActive')
        .lean(),
    ]);
    if (!student) throw new NotFoundException('Alumno no encontrado');
    if (!group) throw new NotFoundException('Grupo no encontrado');
    if (!group.isActive) throw new BadRequestException(`${group.name} no está activo.`);
    if ((group.studentIds ?? []).some((id) => String(id) === dto.studentId)) {
      throw new BadRequestException(
        `${student.name} ya cursa en ${group.name}: esa clase ya es suya.`,
      );
    }
    const weekday = DateTime.fromISO(dto.date, { zone: envConfig.timezone }).weekday;
    if (!(group.schedule ?? []).some((slot) => slot.weekday === weekday)) {
      throw new BadRequestException(`${group.name} no tiene clase el ${ddmm(dto.date)}.`);
    }
    const createdByName =
      dto.doneBy?.trim() ||
      (actor?.id && Types.ObjectId.isValid(actor.id)
        ? (await this.userModel.findById(actor.id).select('name').lean())?.name
        : undefined);
    const saved = await this.extraModel.findOneAndUpdate(
      {
        studentId: new Types.ObjectId(dto.studentId),
        groupId: group._id,
        date: dto.date,
      },
      {
        $set: {
          notes: dto.notes?.trim() || undefined,
          ...(createdByName && { createdByName }),
        },
      },
      { upsert: true, new: true },
    );
    const [view] = await this.views([saved.toObject() as ExtraRow]);
    return view;
  }

  async cancel(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('id inválido');
    const res = await this.extraModel.deleteOne({ _id: new Types.ObjectId(id) });
    if (!res.deletedCount) throw new NotFoundException('Clase extra no encontrada');
    return { success: true };
  }

  private async views(rows: ExtraRow[]) {
    if (!rows.length) return [];
    const [groups, students] = await Promise.all([
      this.groupModel
        .find({ _id: { $in: rows.map((r) => r.groupId) } })
        .select('name schedule')
        .lean(),
      this.studentModel
        .find({ _id: { $in: rows.map((r) => r.studentId) } })
        .select('name')
        .lean(),
    ]);
    const groupById = new Map(groups.map((g) => [String(g._id), g]));
    const nameOf = new Map(students.map((s) => [String(s._id), s.name]));
    return rows.map((r) => {
      const g = groupById.get(String(r.groupId));
      return {
        _id: String(r._id),
        student: { _id: String(r.studentId), name: nameOf.get(String(r.studentId)) ?? '—' },
        groupId: String(r.groupId),
        groupName: g?.name ?? 'Grupo',
        start: g?.schedule?.[0]?.start,
        date: r.date,
        notes: r.notes,
        createdByName: r.createdByName,
      };
    });
  }
}
