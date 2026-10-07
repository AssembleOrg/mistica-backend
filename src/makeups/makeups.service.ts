import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import {
  Attendance,
  AttendanceDocument,
} from '../common/schemas/attendance.schema';
import { Group, GroupDocument } from '../common/schemas/group.schema';
import {
  MakeupClass,
  MakeupClassDocument,
} from '../common/schemas/makeup-class.schema';
import { Student, StudentDocument } from '../common/schemas/student.schema';
import { User, UserDocument } from '../common/schemas/user.schema';
import {
  ListMakeupsQueryDto,
  ScheduleMakeupDto,
} from '../common/dto/makeup.dto';
import { envConfig } from '../config/env.config';

/**
 * SCHEDULED = agendada, todavía no se tomó asistencia ese día.
 * DONE = vino (la asistencia de destino la marcó presente).
 * MISSED = no vino a recuperar: la clase original sigue pendiente.
 */
export type MakeupStatus = 'SCHEDULED' | 'DONE' | 'MISSED';

type MakeupRow = {
  _id: Types.ObjectId;
  studentId: Types.ObjectId;
  fromGroupId: Types.ObjectId;
  fromDate: string;
  toGroupId: Types.ObjectId;
  toDate: string;
  notes?: string;
  createdByName?: string;
};

function weekdayOf(dateKey: string): number {
  return DateTime.fromISO(dateKey, { zone: envConfig.timezone }).weekday;
}

function ddmm(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${d}/${m}`;
}

/**
 * Recuperaciones de clases del taller. Se agendan apenas se sabe (el día que
 * faltó, o antes si avisa): no esperan a que se tome la asistencia, así la
 * clase de destino ya la muestra sumada aunque todavía no haya pasado.
 */
@Injectable()
export class MakeupsService {
  constructor(
    @InjectModel(MakeupClass.name)
    private readonly makeupModel: Model<MakeupClassDocument>,
    @InjectModel(Attendance.name)
    private readonly attendanceModel: Model<AttendanceDocument>,
    @InjectModel(Group.name)
    private readonly groupModel: Model<GroupDocument>,
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Con grupo y día: las que llegan a esa clase y las que salen de ella. Con
   * alumno: las suyas, de la más nueva a la más vieja.
   */
  async list(query: ListMakeupsQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.groupId && query.date) {
      const groupId = new Types.ObjectId(query.groupId);
      filter.$or = [
        { toGroupId: groupId, toDate: query.date },
        { fromGroupId: groupId, fromDate: query.date },
      ];
    } else if (query.groupId) {
      const groupId = new Types.ObjectId(query.groupId);
      filter.$or = [{ toGroupId: groupId }, { fromGroupId: groupId }];
    }
    if (query.studentId) filter.studentId = new Types.ObjectId(query.studentId);
    if (!filter.$or && !filter.studentId) {
      throw new BadRequestException('Indicá el grupo o el alumno.');
    }
    const rows = await this.makeupModel
      .find(filter)
      .sort({ fromDate: -1 })
      .limit(200)
      .lean<MakeupRow[]>();
    return this.views(rows);
  }

  async schedule(dto: ScheduleMakeupDto, actor?: { id?: string }) {
    const [student, from, to] = await Promise.all([
      this.studentModel
        .findOne({ _id: dto.studentId, deletedAt: { $exists: false } })
        .select('name')
        .lean(),
      this.groupModel
        .findOne({ _id: dto.fromGroupId, deletedAt: { $exists: false } })
        .select('name schedule')
        .lean(),
      this.groupModel
        .findOne({ _id: dto.toGroupId, deletedAt: { $exists: false } })
        .select('name schedule studentIds isActive')
        .lean(),
    ]);
    if (!student) throw new NotFoundException('Alumno no encontrado');
    if (!from || !to) throw new NotFoundException('Grupo no encontrado');
    if (String(from._id) === String(to._id)) {
      throw new BadRequestException(
        'La recuperación es en otro grupo: ese día ya es su clase.',
      );
    }
    if (!to.isActive) {
      throw new BadRequestException(`${to.name} no está activo.`);
    }
    if ((to.studentIds ?? []).some((id) => String(id) === dto.studentId)) {
      throw new BadRequestException(
        `${student.name} ya cursa en ${to.name}: elegí la clase de otro grupo.`,
      );
    }
    const hasClass = (g: { schedule?: Array<{ weekday: number }> }, date: string) =>
      (g.schedule ?? []).some((slot) => slot.weekday === weekdayOf(date));
    if (!hasClass(from, dto.fromDate)) {
      throw new BadRequestException(`${from.name} no tiene clase el ${ddmm(dto.fromDate)}.`);
    }
    if (!hasClass(to, dto.toDate)) {
      throw new BadRequestException(`${to.name} no tiene clase el ${ddmm(dto.toDate)}.`);
    }

    const studentId = new Types.ObjectId(dto.studentId);
    const fromGroupId = from._id as Types.ObjectId;
    const toGroupId = to._id as Types.ObjectId;

    // Ese día ya viene a recuperar otra clase.
    const sameDay = await this.makeupModel
      .findOne({
        studentId,
        toGroupId,
        toDate: dto.toDate,
        $nor: [{ fromGroupId, fromDate: dto.fromDate }],
      })
      .lean();
    if (sameDay) {
      throw new BadRequestException(
        `Ese día ya recupera la clase del ${ddmm(sameDay.fromDate)}.`,
      );
    }

    // La clase original ya se recuperó en otro lado.
    const source = await this.attendanceModel.findOne({
      groupId: fromGroupId,
      dateKey: dto.fromDate,
    });
    const sourceRecord = source?.records.find(
      (r) => String(r.studentId) === dto.studentId,
    );
    if (
      sourceRecord?.recoveredInDate &&
      (String(sourceRecord.recoveredInGroupId) !== dto.toGroupId ||
        sourceRecord.recoveredInDate !== dto.toDate)
    ) {
      throw new BadRequestException(
        `Esa clase ya la recuperó el ${ddmm(sourceRecord.recoveredInDate)}.`,
      );
    }

    const createdByName =
      dto.doneBy?.trim() ||
      (actor?.id && Types.ObjectId.isValid(actor.id)
        ? (await this.userModel.findById(actor.id).select('name').lean())?.name
        : undefined);
    const saved = await this.makeupModel.findOneAndUpdate(
      { studentId, fromGroupId, fromDate: dto.fromDate },
      {
        $set: {
          toGroupId,
          toDate: dto.toDate,
          notes: dto.notes?.trim() || undefined,
          ...(createdByName && { createdByName }),
        },
      },
      { upsert: true, new: true },
    );

    // Si recupera esa clase es porque no vino: si la asistencia ya estaba
    // tomada (todos presentes por defecto), queda ausente.
    if (source && sourceRecord?.status === 'PRESENT') {
      sourceRecord.status = 'ABSENT';
      await source.save();
    }

    const [view] = await this.views([saved.toObject() as MakeupRow]);
    return view;
  }

  /**
   * Cancela la recuperación. Si ya vino (la asistencia de destino la tiene),
   * también la saca de esa asistencia y la clase original vuelve a quedar
   * pendiente.
   */
  async cancel(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('id inválido');
    const makeup = await this.makeupModel.findById(id);
    if (!makeup) throw new NotFoundException('Recuperación no encontrada');

    const target = await this.attendanceModel.findOne({
      groupId: makeup.toGroupId,
      dateKey: makeup.toDate,
    });
    if (target) {
      const before = target.records.length;
      target.records = target.records.filter(
        (r) =>
          !(
            String(r.studentId) === String(makeup.studentId) &&
            String(r.makeupForGroupId) === String(makeup.fromGroupId) &&
            r.makeupForDate === makeup.fromDate
          ),
      );
      if (target.records.length !== before) await target.save();
    }
    const source = await this.attendanceModel.findOne({
      groupId: makeup.fromGroupId,
      dateKey: makeup.fromDate,
    });
    const record = source?.records.find(
      (r) =>
        String(r.studentId) === String(makeup.studentId) &&
        String(r.recoveredInGroupId) === String(makeup.toGroupId) &&
        r.recoveredInDate === makeup.toDate,
    );
    if (source && record) {
      record.recoveredInGroupId = undefined;
      record.recoveredInDate = undefined;
      record.recoveredAt = undefined;
      await source.save();
    }
    await makeup.deleteOne();
    return { success: true };
  }

  /** Arma la vista con nombres, horarios y si ya vino (según la asistencia). */
  private async views(rows: MakeupRow[]) {
    if (!rows.length) return [];
    const groupIds = [
      ...new Set(rows.flatMap((r) => [String(r.fromGroupId), String(r.toGroupId)])),
    ];
    const [groups, students, targets] = await Promise.all([
      this.groupModel
        .find({ _id: { $in: groupIds } })
        .select('name schedule')
        .lean(),
      this.studentModel
        .find({ _id: { $in: rows.map((r) => r.studentId) } })
        .select('name')
        .lean(),
      this.attendanceModel
        .find({
          $or: rows.map((r) => ({ groupId: r.toGroupId, dateKey: r.toDate })),
        })
        .select('groupId dateKey records')
        .lean(),
    ]);
    const groupById = new Map(groups.map((g) => [String(g._id), g]));
    const nameOf = new Map(students.map((s) => [String(s._id), s.name]));
    const targetOf = new Map(
      targets.map((t) => [`${String(t.groupId)}:${t.dateKey}`, t]),
    );
    return rows.map((r) => {
      const fromGroup = groupById.get(String(r.fromGroupId));
      const toGroup = groupById.get(String(r.toGroupId));
      const record = targetOf
        .get(`${String(r.toGroupId)}:${r.toDate}`)
        ?.records.find(
          (x) =>
            String(x.studentId) === String(r.studentId) &&
            String(x.makeupForGroupId) === String(r.fromGroupId) &&
            x.makeupForDate === r.fromDate,
        );
      const status: MakeupStatus =
        record?.status === 'MAKEUP'
          ? 'DONE'
          : record?.status === 'ABSENT'
            ? 'MISSED'
            : 'SCHEDULED';
      return {
        _id: String(r._id),
        student: {
          _id: String(r.studentId),
          name: nameOf.get(String(r.studentId)) ?? '—',
        },
        fromGroupId: String(r.fromGroupId),
        fromGroupName: fromGroup?.name ?? 'Grupo',
        fromStart: fromGroup?.schedule?.[0]?.start,
        fromDate: r.fromDate,
        toGroupId: String(r.toGroupId),
        toGroupName: toGroup?.name ?? 'Grupo',
        toStart: toGroup?.schedule?.[0]?.start,
        toDate: r.toDate,
        notes: r.notes,
        createdByName: r.createdByName,
        status,
      };
    });
  }
}
