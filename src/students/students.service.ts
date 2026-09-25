import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { Student, StudentDocument } from '../common/schemas/student.schema';
import { Client, ClientDocument } from '../common/schemas/client.schema';
import {
  StudentPayment,
  StudentPaymentDocument,
} from '../common/schemas/student-payment.schema';
import {
  Attendance,
  AttendanceDocument,
} from '../common/schemas/attendance.schema';
import { Group, GroupDocument } from '../common/schemas/group.schema';
import { Piece, PieceDocument } from '../common/schemas/piece.schema';
import {
  Professor,
  ProfessorDocument,
} from '../common/schemas/professor.schema';
import { UserRole } from '../common/enums/user-role.enum';
import {
  StudentRegularityEvent,
  StudentRegularityEventDocument,
} from '../common/schemas/student-regularity-event.schema';
import {
  StudentMonthlyPiece,
  StudentMonthlyPieceDocument,
} from '../common/schemas/student-monthly-piece.schema';
import { UpsertMonthlyPieceDto } from '../common/dto/student-monthly-piece.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { InAppNotificationsService } from '../in-app-notifications/in-app-notifications.service';
import {
  CreateStudentDto,
  CreateStudentPaymentDto,
  SaveAttendanceDto,
  UpdateStudentDto,
  UpdateStudentPaymentDto,
} from '../common/dto/student.dto';

/**
 * Alumnos del taller. El seguimiento está partido en dos áreas:
 * · ADMINISTRATIVO: datos + pagos + regularidad + vencimientos (perfil admin).
 * · PRÁCTICO: grupos, asistencia y piezas (perfil profesor) — sin plata.
 */
@Injectable()
export class StudentsService {
  constructor(
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel(Client.name)
    private readonly clientModel: Model<ClientDocument>,
    @InjectModel(StudentPayment.name)
    private readonly paymentModel: Model<StudentPaymentDocument>,
    @InjectModel(Attendance.name)
    private readonly attendanceModel: Model<AttendanceDocument>,
    @InjectModel(Group.name)
    private readonly groupModel: Model<GroupDocument>,
    @InjectModel(Piece.name)
    private readonly pieceModel: Model<PieceDocument>,
    @InjectModel(Professor.name)
    private readonly professorModel: Model<ProfessorDocument>,
    @InjectModel(StudentRegularityEvent.name)
    private readonly regularityEventModel: Model<StudentRegularityEventDocument>,
    @InjectModel(StudentMonthlyPiece.name)
    private readonly monthlyPieceModel: Model<StudentMonthlyPieceDocument>,
    private readonly notifications: NotificationsService,
    private readonly inAppNotifications: InAppNotificationsService,
  ) {}

  // ── Alumnos ──────────────────────────────────────────────────────────────

  async list(actor?: { id?: string; role?: string }, includeInactive = false) {
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (!includeInactive) filter.isActive = true;
    if (actor?.role === UserRole.ADMIN) {
      return this.studentModel.find(filter).sort({ name: 1 }).lean();
    }

    const professor = await this.professorOf(actor);
    if (!professor) return [];
    const groupRows = await this.groupModel
      .find({ professorId: professor._id, deletedAt: { $exists: false } })
      .select('studentIds')
      .lean();
    const ids = [
      ...new Set(groupRows.flatMap((group) => group.studentIds.map(String))),
    ];
    if (!ids.length) return [];
    // El listado de profesor no incluye datos personales/administrativos.
    return this.studentModel
      .find({ ...filter, _id: { $in: ids } })
      .select('name isActive createdAt updatedAt')
      .sort({ name: 1 })
      .lean();
  }

  async create(dto: CreateStudentDto) {
    const client = await this.clientFor(dto.clientId);
    return this.studentModel.create({
      ...dto,
      clientId: client?._id,
      clientName: client?.fullName,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      joinedAt: dto.joinedAt ? new Date(dto.joinedAt) : new Date(),
    });
  }

  async update(id: string, dto: UpdateStudentDto) {
    const student = await this.findOrThrow(id);
    const { birthDate, joinedAt, clientId, ...rest } = dto;
    Object.assign(student, rest);
    if (clientId !== undefined) {
      const client = await this.clientFor(clientId);
      student.clientId = client?._id as Types.ObjectId | undefined;
      student.clientName = client?.fullName;
    }
    if (birthDate !== undefined)
      student.birthDate = birthDate ? new Date(birthDate) : undefined;
    if (joinedAt !== undefined && joinedAt)
      student.joinedAt = new Date(joinedAt);
    student.updatedAt = new Date();
    await student.save();
    return student;
  }

  private async clientFor(id?: string) {
    if (!id) return undefined;
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('clientId inválido');
    const client = await this.clientModel
      .findOne({ _id: id, deletedAt: { $exists: false } })
      .exec();
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  async remove(id: string) {
    const student = await this.findOrThrow(id);
    student.deletedAt = new Date();
    student.isActive = false;
    await student.save();
    return { success: true };
  }

  /**
   * Ficha PRÁCTICA del alumno (lo que necesita el profesor): grupos en los
   * que cursa (con días y horarios), últimas asistencias (incluye si está
   * recuperando) y sus piezas con estado y fotos. Sin datos de plata.
   */
  async practicalProfile(id: string, actor?: { id?: string; role?: string }) {
    const student = await this.findOrThrow(id);
    const sid = student._id as Types.ObjectId;
    await this.assertCanReadPractical(sid, actor);
    const [groups, recentAttendance, pieces] = await Promise.all([
      this.groupModel
        .find({ studentIds: sid, deletedAt: { $exists: false } })
        .sort({ name: 1 })
        .lean(),
      this.attendanceModel
        .find({ 'records.studentId': sid })
        .sort({ dateKey: -1 })
        .limit(20)
        .lean(),
      this.pieceModel
        .find({ studentId: sid, deletedAt: { $exists: false } })
        .sort({ createdAt: -1 })
        .lean(),
    ]);
    return {
      student: {
        id: String(sid),
        name: student.name,
        practicalNotes: student.practicalNotes,
        isActive: student.isActive,
      },
      groups,
      attendance: recentAttendance.map((a) => ({
        groupId: String(a.groupId),
        dateKey: a.dateKey,
        record: a.records.find((r) => String(r.studentId) === String(sid)),
      })),
      pieces,
    };
  }

  /**
   * Ficha ADMINISTRATIVA: datos completos + grupos + historial de pagos +
   * regularidad (cuotas vencidas / al día).
   */
  async adminProfile(id: string) {
    const student = await this.findOrThrow(id);
    const sid = student._id as Types.ObjectId;
    // Crea el primer punto de la línea de tiempo al observar al alumno, sin
    // intentar inventar cómo estaba antes de que existiera este módulo.
    await this.recordRegularity(sid, 'DAILY_CHECK');
    const [groups, payments, regularityHistory] = await Promise.all([
      this.groupModel
        .find({ studentIds: sid, deletedAt: { $exists: false } })
        .sort({ name: 1 })
        .lean(),
      this.paymentModel
        .find({ studentId: sid, deletedAt: { $exists: false } })
        .sort({ createdAt: -1 })
        .lean(),
      this.regularityEventModel
        .find({ studentId: sid })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
    ]);
    const now = new Date();
    const overdue = payments.filter(
      (p) => p.status === 'PENDING' && p.dueDate && p.dueDate < now,
    );
    return {
      student: student.toObject(),
      groups,
      payments,
      regularity: {
        // Al día = sin cuotas pendientes vencidas.
        upToDate: overdue.length === 0,
        overdueCount: overdue.length,
        overdueAmount: overdue.reduce((a, p) => a + (p.amount || 0), 0),
      },
      regularityHistory,
    };
  }

  // ── Pagos ────────────────────────────────────────────────────────────────

  async addPayment(
    studentId: string,
    dto: CreateStudentPaymentDto,
    userId?: string,
  ) {
    const student = await this.findOrThrow(studentId);
    const payment = await this.paymentModel.create({
      studentId: student._id,
      concept: dto.concept,
      amount: dto.amount,
      status: dto.status ?? 'PENDING',
      paidAt: dto.paidAt
        ? new Date(dto.paidAt)
        : dto.status === 'PAID'
          ? new Date()
          : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      method: dto.method,
      notes: dto.notes,
      createdById:
        userId && Types.ObjectId.isValid(userId) ? userId : undefined,
    });
    await this.recordRegularity(
      student._id as Types.ObjectId,
      'PAYMENT_CREATED',
    );
    return payment;
  }

  async updatePayment(paymentId: string, dto: UpdateStudentPaymentDto) {
    if (!Types.ObjectId.isValid(paymentId))
      throw new BadRequestException('id inválido');
    const payment = await this.paymentModel.findById(paymentId).exec();
    if (!payment || payment.deletedAt)
      throw new NotFoundException('Pago no encontrado');
    const { paidAt, dueDate, ...rest } = dto;
    Object.assign(payment, rest);
    if (paidAt !== undefined)
      payment.paidAt = paidAt ? new Date(paidAt) : undefined;
    if (dueDate !== undefined)
      payment.dueDate = dueDate ? new Date(dueDate) : undefined;
    // Marcar PAID sin fecha => ahora.
    if (dto.status === 'PAID' && !payment.paidAt) payment.paidAt = new Date();
    payment.updatedAt = new Date();
    await payment.save();
    await this.recordRegularity(payment.studentId, 'PAYMENT_UPDATED');
    return payment;
  }

  async removePayment(paymentId: string) {
    if (!Types.ObjectId.isValid(paymentId))
      throw new BadRequestException('id inválido');
    const payment = await this.paymentModel.findById(paymentId).exec();
    if (!payment || payment.deletedAt)
      throw new NotFoundException('Pago no encontrado');
    payment.deletedAt = new Date();
    await payment.save();
    await this.recordRegularity(payment.studentId, 'PAYMENT_REMOVED');
    return { success: true };
  }

  /**
   * Panel de situaciones administrativas que requieren atención: cuotas
   * PENDIENTES vencidas y por vencer en los próximos `days` días.
   */
  async paymentAlerts(days = 7) {
    const now = new Date();
    const soon = new Date(now.getTime() + days * 24 * 3600_000);
    const pending = await this.paymentModel
      .find({
        status: 'PENDING',
        deletedAt: { $exists: false },
        dueDate: { $lte: soon },
      })
      .sort({ dueDate: 1 })
      .lean();
    const ids = [...new Set(pending.map((p) => String(p.studentId)))];
    const students = await this.studentModel
      .find({ _id: { $in: ids } })
      .select('name phone')
      .lean();
    const nameOf = new Map(students.map((s) => [String(s._id), s]));
    return pending.map((p) => ({
      paymentId: String(p._id),
      studentId: String(p.studentId),
      studentName: nameOf.get(String(p.studentId))?.name ?? '(alumno borrado)',
      studentPhone: nameOf.get(String(p.studentId))?.phone,
      concept: p.concept,
      amount: p.amount,
      dueDate: p.dueDate,
      overdue: !!p.dueDate && p.dueDate < now,
    }));
  }

  // ── Asistencia ───────────────────────────────────────────────────────────

  /** Crea o reemplaza la asistencia de un grupo para un día (upsert). */
  async saveAttendance(
    dto: SaveAttendanceDto,
    actor?: { id?: string; role?: string },
  ) {
    if (!Types.ObjectId.isValid(dto.groupId))
      throw new BadRequestException('groupId inválido');
    await this.assertCanManageGroup(new Types.ObjectId(dto.groupId), actor);
    const targetGroupId = new Types.ObjectId(dto.groupId);
    const previous = await this.attendanceModel
      .findOne({ groupId: targetGroupId, dateKey: dto.date })
      .lean();
    const records = dto.records.map((r) => {
      const existingRecord = previous?.records.find(
        (candidate) => String(candidate.studentId) === r.studentId,
      );
      if (r.status === 'MAKEUP' && (!r.makeupForGroupId || !r.makeupForDate)) {
        throw new BadRequestException(
          'Cada recuperación debe indicar el grupo y la fecha de la clase original.',
        );
      }
      if (
        r.status === 'MAKEUP' &&
        r.makeupForGroupId === dto.groupId &&
        r.makeupForDate === dto.date
      ) {
        throw new BadRequestException(
          'Una clase no puede recuperarse en sí misma.',
        );
      }
      // Un alumno sumado para recuperar que finalmente no vino queda AUSENTE
      // pero conserva qué clase iba a recuperar (no se marca como recuperada).
      const keepsMakeupRef =
        r.status !== 'PRESENT' && !!r.makeupForGroupId && !!r.makeupForDate;
      return {
        studentId: new Types.ObjectId(r.studentId),
        status: r.status,
        notes: r.notes,
        makeupForGroupId: keepsMakeupRef
          ? new Types.ObjectId(r.makeupForGroupId)
          : undefined,
        makeupForDate: keepsMakeupRef ? r.makeupForDate : undefined,
        recoveredInGroupId: existingRecord?.recoveredInGroupId,
        recoveredInDate: existingRecord?.recoveredInDate,
        recoveredAt: existingRecord?.recoveredAt,
      };
    });
    const saved = await this.attendanceModel.findOneAndUpdate(
      { groupId: targetGroupId, dateKey: dto.date },
      {
        $set: {
          records,
          takenById:
            actor?.id && Types.ObjectId.isValid(actor.id)
              ? actor.id
              : undefined,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true },
    );

    const newLinks = new Set(
      records
        .filter((r) => r.status === 'MAKEUP')
        .map(
          (r) =>
            `${String(r.studentId)}:${String(r.makeupForGroupId)}:${r.makeupForDate}`,
        ),
    );
    for (const old of previous?.records ?? []) {
      if (
        old.status !== 'MAKEUP' ||
        !old.makeupForGroupId ||
        !old.makeupForDate
      )
        continue;
      const key = `${String(old.studentId)}:${String(old.makeupForGroupId)}:${old.makeupForDate}`;
      if (!newLinks.has(key)) {
        await this.clearRecoveryLink(
          old.studentId,
          old.makeupForGroupId,
          old.makeupForDate,
          targetGroupId,
          dto.date,
        );
      }
    }
    for (const record of records) {
      if (
        record.status === 'MAKEUP' &&
        record.makeupForGroupId &&
        record.makeupForDate
      ) {
        await this.linkRecoveredClass(
          record.studentId,
          record.makeupForGroupId,
          record.makeupForDate,
          targetGroupId,
          dto.date,
        );
      }
    }
    return saved;
  }

  async attendanceOfGroup(
    groupId: string,
    limit = 30,
    actor?: { id?: string; role?: string },
  ) {
    if (!Types.ObjectId.isValid(groupId))
      throw new BadRequestException('groupId inválido');
    await this.assertCanReadGroup(new Types.ObjectId(groupId), actor);
    return this.attendanceModel
      .find({ groupId: new Types.ObjectId(groupId) })
      .sort({ dateKey: -1 })
      .limit(limit)
      .lean();
  }

  private async linkRecoveredClass(
    studentId: Types.ObjectId,
    sourceGroupId: Types.ObjectId,
    sourceDate: string,
    targetGroupId: Types.ObjectId,
    targetDate: string,
  ) {
    const source = await this.attendanceModel.findOne({
      groupId: sourceGroupId,
      dateKey: sourceDate,
    });
    const recovery = {
      recoveredInGroupId: targetGroupId,
      recoveredInDate: targetDate,
      recoveredAt: new Date(),
    };
    if (!source) {
      await this.attendanceModel.create({
        groupId: sourceGroupId,
        dateKey: sourceDate,
        records: [{ studentId, status: 'ABSENT', ...recovery }],
      });
      return;
    }
    const record = source.records.find(
      (candidate) => String(candidate.studentId) === String(studentId),
    );
    if (record) {
      record.recoveredInGroupId = recovery.recoveredInGroupId;
      record.recoveredInDate = recovery.recoveredInDate;
      record.recoveredAt = recovery.recoveredAt;
    } else {
      source.records.push({
        studentId,
        status: 'ABSENT',
        ...recovery,
      } as never);
    }
    await source.save();
  }

  private async clearRecoveryLink(
    studentId: Types.ObjectId,
    sourceGroupId: Types.ObjectId,
    sourceDate: string,
    targetGroupId: Types.ObjectId,
    targetDate: string,
  ) {
    const source = await this.attendanceModel.findOne({
      groupId: sourceGroupId,
      dateKey: sourceDate,
    });
    const record = source?.records.find(
      (candidate) => String(candidate.studentId) === String(studentId),
    );
    if (
      !source ||
      !record ||
      String(record.recoveredInGroupId) !== String(targetGroupId) ||
      record.recoveredInDate !== targetDate
    )
      return;
    record.recoveredInGroupId = undefined;
    record.recoveredInDate = undefined;
    record.recoveredAt = undefined;
    await source.save();
  }

  private async findOrThrow(id: string): Promise<StudentDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const student = await this.studentModel.findById(id).exec();
    if (!student || student.deletedAt)
      throw new NotFoundException('Alumno no encontrado');
    return student;
  }

  /** Guarda sólo cambios de estado, sin inventar una historia previa. */
  private async recordRegularity(
    studentId: Types.ObjectId,
    source: StudentRegularityEvent['source'],
  ) {
    const now = new Date();
    const overdue = await this.paymentModel
      .find({
        studentId,
        status: 'PENDING',
        deletedAt: { $exists: false },
        dueDate: { $lt: now },
      })
      .select('amount')
      .lean();
    const next = {
      status: overdue.length ? ('OVERDUE' as const) : ('UP_TO_DATE' as const),
      overdueCount: overdue.length,
      overdueAmount: overdue.reduce((sum, item) => sum + (item.amount || 0), 0),
    };
    const previous = await this.regularityEventModel
      .findOne({ studentId })
      .sort({ createdAt: -1 })
      .lean();
    if (
      previous &&
      previous.status === next.status &&
      previous.overdueCount === next.overdueCount &&
      previous.overdueAmount === next.overdueAmount
    )
      return;
    await this.regularityEventModel.create({ studentId, ...next, source });
  }

  /** Recalcula vencimientos y avisa una vez al equipo: a 3 días y al vencer. */
  @Cron('5 9 * * *', { timeZone: 'America/Argentina/Buenos_Aires' })
  async dailyPaymentFollowUp() {
    const now = new Date();
    const inThreeDays = new Date(now);
    inThreeDays.setDate(inThreeDays.getDate() + 3);
    const [dueSoon, overdue] = await Promise.all([
      this.paymentModel.find({
        status: 'PENDING',
        deletedAt: { $exists: false },
        dueDate: { $gte: now, $lte: inThreeDays },
        dueReminderSentAt: { $exists: false },
      }),
      this.paymentModel.find({
        status: 'PENDING',
        deletedAt: { $exists: false },
        dueDate: { $lt: now },
        overdueReminderSentAt: { $exists: false },
      }),
    ]);
    const pending = [...dueSoon, ...overdue];
    if (!pending.length) return;
    const students = await this.studentModel
      .find({ _id: { $in: pending.map((p) => p.studentId) } })
      .select('name')
      .lean();
    const names = new Map(
      students.map((student) => [String(student._id), student.name]),
    );
    const lines = pending.map(
      (payment) =>
        `• ${names.get(String(payment.studentId)) ?? 'Alumno'}: ${payment.concept}`,
    );
    const studentIds = [
      ...new Set(pending.map((payment) => String(payment.studentId))),
    ];
    for (const id of studentIds) {
      await this.recordRegularity(new Types.ObjectId(id), 'DAILY_CHECK');
    }
    // El aviso en sistema es la fuente de verdad: no depende de WhatsApp ni
    // de que haya una cuenta conectada en ese momento (queda persistido).
    await this.inAppNotifications.create({
      type: 'PAYMENT_DUE',
      title: `Cuotas para revisar (${pending.length})`,
      body: lines.join('\n'),
    });
    await this.notifications.notifyTeam(
      `Recordatorio administrativo de cuotas:\n${lines.join('\n')}`,
    );
    await Promise.all([
      ...dueSoon.map((payment) =>
        this.paymentModel.updateOne(
          { _id: payment._id },
          { $set: { dueReminderSentAt: new Date() } },
        ),
      ),
      ...overdue.map((payment) =>
        this.paymentModel.updateOne(
          { _id: payment._id },
          { $set: { overdueReminderSentAt: new Date() } },
        ),
      ),
    ]);
  }

  // ── Pieza del mes ────────────────────────────────────────────────────────
  // Cada alumno elige UNA pieza por mes (fresca o bizcochada). Reemplaza la
  // planilla "coladas del mes". Lo práctico (pieza, bizcocho, entregada) lo
  // carga cualquiera con acceso al alumno; el adicional y su cobro, sólo admin.

  /** Planilla del mes: todos los alumnos visibles para el actor, con su pieza. */
  async monthlyPiecesOfMonth(
    month: string,
    actor?: { id?: string; role?: string },
  ) {
    assertMonth(month);
    const students = await this.list(actor, false);
    const ids = students.map((s) => s._id as Types.ObjectId);
    const [pieces, groups] = await Promise.all([
      this.monthlyPieceModel.find({ month, studentId: { $in: ids } }).lean(),
      this.groupModel
        .find({ studentIds: { $in: ids }, deletedAt: { $exists: false } })
        .select('name schedule studentIds')
        .lean(),
    ]);
    const hex = (v: unknown) => (v as Types.ObjectId).toHexString();
    const byStudent = new Map(pieces.map((p) => [hex(p.studentId), p]));
    const groupsOf = new Map<string, { name: string; schedule: unknown[] }[]>();
    for (const g of groups) {
      for (const sid of g.studentIds) {
        const k = hex(sid);
        const arr = groupsOf.get(k) ?? [];
        arr.push({ name: g.name, schedule: g.schedule });
        groupsOf.set(k, arr);
      }
    }
    const isAdmin = actor?.role === UserRole.ADMIN;
    return students.map((s) => ({
      student: { _id: hex(s._id), name: s.name },
      groups: groupsOf.get(hex(s._id)) ?? [],
      piece: this.monthlyPieceView(byStudent.get(hex(s._id)), isAdmin),
    }));
  }

  /** Historial de piezas del mes de un alumno (más reciente primero). */
  async monthlyPiecesOfStudent(
    id: string,
    actor?: { id?: string; role?: string },
  ) {
    const student = await this.findOrThrow(id);
    await this.assertCanReadPractical(student._id as Types.ObjectId, actor);
    const rows = await this.monthlyPieceModel
      .find({ studentId: student._id })
      .sort({ month: -1 })
      .limit(24)
      .lean();
    const isAdmin = actor?.role === UserRole.ADMIN;
    return rows.map((r) => this.monthlyPieceView(r, isAdmin));
  }

  async upsertMonthlyPiece(
    id: string,
    month: string,
    dto: UpsertMonthlyPieceDto,
    actor?: { id?: string; role?: string },
  ) {
    assertMonth(month);
    const student = await this.findOrThrow(id);
    await this.assertCanReadPractical(student._id as Types.ObjectId, actor);
    const isAdmin = actor?.role === UserRole.ADMIN;
    const set: Record<string, unknown> = {};
    if (dto.pieceName !== undefined) set.pieceName = dto.pieceName.trim();
    if (dto.bisque !== undefined) set.bisque = dto.bisque;
    if (dto.delivered !== undefined) set.delivered = dto.delivered;
    if (dto.notes !== undefined) set.notes = dto.notes.trim();
    // Plata: sólo admin. Un profesor que mande estos campos los ignora.
    if (isAdmin) {
      if (dto.extraCharge !== undefined) set.extraCharge = dto.extraCharge;
      if (dto.extraAmount !== undefined) set.extraAmount = dto.extraAmount;
      if (dto.paid !== undefined) set.paid = dto.paid;
    }
    if (actor?.id && Types.ObjectId.isValid(actor.id)) {
      set.updatedById = new Types.ObjectId(actor.id);
    }
    const row = await this.monthlyPieceModel
      .findOneAndUpdate(
        { studentId: student._id, month },
        { $set: set, $setOnInsert: { studentId: student._id, month } },
        { new: true, upsert: true },
      )
      .lean();
    return this.monthlyPieceView(row, isAdmin);
  }

  async removeMonthlyPiece(id: string, month: string) {
    assertMonth(month);
    const student = await this.findOrThrow(id);
    await this.monthlyPieceModel.deleteOne({ studentId: student._id, month });
    return { success: true };
  }

  private monthlyPieceView(
    r: (StudentMonthlyPiece & { _id: unknown }) | null | undefined,
    isAdmin: boolean,
  ) {
    if (!r) return null;
    return {
      _id: (r._id as Types.ObjectId).toHexString(),
      month: r.month,
      pieceName: r.pieceName ?? '',
      bisque: r.bisque ?? false,
      delivered: r.delivered ?? false,
      notes: r.notes,
      // El adicional y su cobro son datos administrativos.
      ...(isAdmin
        ? {
            extraCharge: r.extraCharge ?? false,
            extraAmount: r.extraAmount,
            paid: r.paid ?? false,
          }
        : {}),
    };
  }

  private async professorOf(actor?: {
    id?: string;
  }): Promise<ProfessorDocument | null> {
    if (!actor?.id || !Types.ObjectId.isValid(actor.id)) return null;
    return this.professorModel
      .findOne({ userId: actor.id, deletedAt: { $exists: false } })
      .exec();
  }

  private async assertCanReadPractical(
    studentId: Types.ObjectId,
    actor?: { id?: string; role?: string },
  ) {
    if (actor?.role === UserRole.ADMIN) return;
    const professor = await this.professorOf(actor);
    if (!professor) {
      throw new ForbiddenException(
        'Tu cuenta no está vinculada a un profesor.',
      );
    }
    const belongs = await this.groupModel.exists({
      professorId: professor._id,
      studentIds: studentId,
      deletedAt: { $exists: false },
    });
    if (!belongs)
      throw new ForbiddenException(
        'Sólo podés consultar alumnos de tus grupos.',
      );
  }

  private async assertCanReadGroup(
    groupId: Types.ObjectId,
    actor?: { id?: string; role?: string },
  ) {
    if (actor?.role === UserRole.ADMIN) return;
    const professor = await this.professorOf(actor);
    const owns =
      professor &&
      (await this.groupModel.exists({
        _id: groupId,
        professorId: professor._id,
        deletedAt: { $exists: false },
      }));
    if (!owns)
      throw new ForbiddenException('Sólo podés consultar tus propios grupos.');
  }

  private async assertCanManageGroup(
    groupId: Types.ObjectId,
    actor?: { id?: string; role?: string },
  ) {
    return this.assertCanReadGroup(groupId, actor);
  }
}

function assertMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new BadRequestException('El mes va en formato YYYY-MM.');
  }
}
