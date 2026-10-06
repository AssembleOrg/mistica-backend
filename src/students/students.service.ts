import {
  BadRequestException,
  Logger,
  OnApplicationBootstrap,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { envConfig } from '../config/env.config';
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
import {
  Group,
  GroupDocument,
  takesMonthlyPiece,
} from '../common/schemas/group.schema';
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
import { User, UserDocument } from '../common/schemas/user.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { InAppNotificationsService } from '../in-app-notifications/in-app-notifications.service';
import {
  CreateStudentDto,
  CollectStudentPaymentDto,
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
export class StudentsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StudentsService.name);
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
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
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

  /**
   * Cobra una cuota pendiente. Si se cobra menos que su importe es un pago
   * parcial: queda registrado lo cobrado y la cuota sigue pendiente por el
   * saldo, con su vencimiento (o el nuevo que se indique).
   */
  async collectPayment(
    paymentId: string,
    dto: CollectStudentPaymentDto,
    userId?: string,
  ) {
    if (!Types.ObjectId.isValid(paymentId))
      throw new BadRequestException('id inválido');
    const payment = await this.paymentModel.findById(paymentId).exec();
    if (!payment || payment.deletedAt)
      throw new NotFoundException('Pago no encontrado');
    if (payment.status !== 'PENDING')
      throw new BadRequestException('Esta cuota ya está paga.');
    const remaining = await this.applyToPending(payment, dto.amount, {
      method: dto.method,
      notes: dto.notes,
      createdById: userId,
      balanceDueDate: dto.balanceDueDate
        ? new Date(dto.balanceDueDate)
        : undefined,
    });
    await this.recordRegularity(payment.studentId, 'PAYMENT_UPDATED');
    return { paid: round2(dto.amount), remaining };
  }

  /**
   * Aplica un cobro a una cuota pendiente. Si cubre el importe (o la cuota no
   * tenía importe), queda PAGADA por lo cobrado. Si no, pago parcial: lo
   * cobrado se registra aparte, pagado y del mismo mes, y la cuota queda
   * pendiente por el saldo. Devuelve el saldo que queda.
   */
  private async applyToPending(
    pending: StudentPaymentDocument,
    amount: number,
    opts: {
      method?: string;
      notes?: string;
      saleId?: string;
      createdById?: string;
      balanceDueDate?: Date;
      now?: Date;
    },
  ): Promise<number> {
    const now = opts.now ?? new Date();
    const paid = round2(amount);
    const due = round2(pending.amount ?? 0);
    const saleId = opts.saleId ? new Types.ObjectId(opts.saleId) : undefined;
    if (due <= 0 || paid >= due - 0.01) {
      pending.status = 'PAID';
      pending.paidAt = now;
      pending.amount = paid;
      if (opts.method) pending.method = opts.method;
      if (opts.notes) pending.notes = opts.notes;
      if (saleId) pending.saleId = saleId;
      await pending.save();
      return 0;
    }
    const base = pending.concept.replace(BALANCE_SUFFIX, '');
    await this.paymentModel.create({
      studentId: pending.studentId,
      concept: `${base} · pago parcial`,
      amount: paid,
      status: 'PAID',
      paidAt: now,
      dueDate: pending.dueDate,
      period: pending.period,
      method: opts.method,
      notes: opts.notes,
      saleId,
      createdById:
        opts.createdById && Types.ObjectId.isValid(opts.createdById)
          ? opts.createdById
          : undefined,
    });
    const remaining = round2(due - paid);
    pending.amount = remaining;
    pending.concept = `${base} · saldo`;
    if (opts.balanceDueDate) {
      pending.dueDate = opts.balanceDueDate;
      // Vencimiento nuevo: los recordatorios vuelven a avisar.
      pending.dueReminderSentAt = undefined;
      pending.overdueReminderSentAt = undefined;
    }
    await pending.save();
    return remaining;
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
    await this.assertTrialsAvailable(dto);
    const records = dto.records.map((r) => {
      const existingRecord = previous?.records.find(
        (candidate) => String(candidate.studentId) === r.studentId,
      );
      if (r.trial && r.status === 'MAKEUP') {
        throw new BadRequestException(
          'Una clase de prueba no puede ser una recuperación.',
        );
      }
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
        trial: r.trial || undefined,
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

    await this.syncTrials(previous?.records ?? [], records, targetGroupId, dto.date);

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

  /**
   * Clase de prueba: una sola por alumno. Si ya vino a una (en otra clase),
   * no se puede marcar otra como gratuita.
   */
  private async assertTrialsAvailable(dto: SaveAttendanceDto) {
    const ids = dto.records.filter((r) => r.trial).map((r) => r.studentId);
    if (!ids.length) return;
    const enrolled = await this.groupModel
      .findOne({
        studentIds: { $in: ids.map((id) => new Types.ObjectId(id)) },
        deletedAt: { $exists: false },
      })
      .select('name studentIds')
      .lean();
    if (enrolled) {
      const sid = ids.find((id) =>
        enrolled.studentIds.some((x) => String(x) === id),
      );
      const s = await this.studentModel.findById(sid).select('name').lean();
      throw new BadRequestException(
        `${s?.name ?? 'El alumno'} ya está inscripto en ${enrolled.name}: la clase de prueba es para quien todavía no se anotó.`,
      );
    }
    const students = await this.studentModel
      .find({ _id: { $in: ids }, trialDate: { $exists: true } })
      .select('name trialGroupId trialDate')
      .lean();
    for (const s of students) {
      const sameClass =
        String(s.trialGroupId) === dto.groupId && s.trialDate === dto.date;
      if (!sameClass) {
        const [y, m, d] = (s.trialDate ?? '').split('-');
        throw new BadRequestException(
          `${s.name} ya usó su clase de prueba gratuita (el ${d}/${m}/${y}).`,
        );
      }
    }
  }

  /**
   * Deja en cada alumno qué clase de prueba usó: la usa si vino (PRESENT);
   * si no vino o se la sacó de esta clase, la vuelve a tener disponible.
   */
  private async syncTrials(
    before: Array<{ studentId: Types.ObjectId; status: string; trial?: boolean }>,
    after: Array<{ studentId: Types.ObjectId; status: string; trial?: boolean }>,
    groupId: Types.ObjectId,
    dateKey: string,
  ) {
    const used = after
      .filter((r) => r.trial && r.status === 'PRESENT')
      .map((r) => r.studentId);
    const usedSet = new Set(used.map(String));
    const released = [...before, ...after]
      .filter((r) => r.trial && !usedSet.has(String(r.studentId)))
      .map((r) => r.studentId);
    if (used.length) {
      await this.studentModel.updateMany(
        { _id: { $in: used } },
        { $set: { trialGroupId: groupId, trialDate: dateKey } },
      );
    }
    if (released.length) {
      // Sólo si la prueba registrada era ésta (no pisar otra clase).
      await this.studentModel.updateMany(
        { _id: { $in: released }, trialGroupId: groupId, trialDate: dateKey },
        { $unset: { trialGroupId: 1, trialDate: 1 } },
      );
    }
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
    // Primero la cuota del mes de cada alumno, así su vencimiento ya entra en
    // los avisos de hoy.
    await this.ensureMonthlyFees().catch((err) =>
      this.logger.error(`No se pudieron generar las cuotas del mes: ${String(err)}`),
    );
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

  // ── Cuota mensual ────────────────────────────────────────────────────────
  // Cada alumno que cursa tiene una cuota por mes que vence su día límite de
  // pago (default el 10). El sistema la crea PENDIENTE; pasado ese día sin
  // pagarla salta la alerta. Venderle en caja un producto marcado como cuota
  // de alumno ("mes cerámica") la marca paga.

  async onApplicationBootstrap() {
    // Al desplegar, las cuotas del mes en curso quedan creadas sin esperar al
    // cron de la mañana. No bloquea el arranque.
    void this.ensureMonthlyFees().catch((err) =>
      this.logger.error(`Cuotas del mes al iniciar: ${String(err)}`),
    );
  }

  /**
   * Crea la cuota PENDIENTE del mes para cada alumno activo que cursa en algún
   * grupo activo y todavía no la tiene. Idempotente: corre todos los días.
   */
  async ensureMonthlyFees(now: Date = new Date()) {
    const period = periodOf(now);
    const groups = await this.groupModel
      .find({ deletedAt: { $exists: false }, isActive: true })
      .select('studentIds')
      .lean();
    const attending = new Set(
      groups.flatMap((g) => (g.studentIds ?? []).map((id) => String(id))),
    );
    if (attending.size === 0) return 0;
    const students = await this.studentModel
      .find({
        _id: { $in: [...attending] },
        isActive: true,
        deletedAt: { $exists: false },
      })
      .select('name paymentDay monthlyFee')
      .lean();
    const monthStart = DateTime.fromISO(`${period}-01`, {
      zone: envConfig.timezone,
    });
    const [withPeriod, paidByHand] = await Promise.all([
      this.paymentModel
        .find({ period, deletedAt: { $exists: false } })
        .select('studentId')
        .lean(),
      // Cuotas cargadas a mano antes de existir el período: si este mes ya
      // registraron una cuota paga, no se le crea otra.
      this.paymentModel
        .find({
          status: 'PAID',
          period: { $exists: false },
          deletedAt: { $exists: false },
          concept: /cuota/i,
          paidAt: {
            $gte: monthStart.toJSDate(),
            $lt: monthStart.plus({ months: 1 }).toJSDate(),
          },
        })
        .select('studentId')
        .lean(),
    ]);
    const covered = new Set(
      [...withPeriod, ...paidByHand].map((p) => String(p.studentId)),
    );
    const docs = students
      .filter((st) => !covered.has(String(st._id)))
      .map((st) => ({
        studentId: st._id,
        concept: `Cuota ${monthLabelEs(period)}`,
        amount: st.monthlyFee ?? 0,
        status: 'PENDING' as const,
        dueDate: dueDateOf(period, st.paymentDay),
        period,
      }));
    if (docs.length) {
      await this.paymentModel.insertMany(docs);
      this.logger.log(`Cuotas de ${period} creadas: ${docs.length}`);
    }
    return docs.length;
  }

  /**
   * ¿El cliente de una venta es alumno? Con su próxima cuota a pagar, para
   * que la caja muestre qué se le va a marcar paga.
   */
  async feeStatusOfClient(clientId: string) {
    if (!Types.ObjectId.isValid(clientId)) return null;
    const student = await this.studentModel
      .findOne({ clientId, deletedAt: { $exists: false } })
      .select('name paymentDay monthlyFee isActive')
      .lean();
    if (!student) return null;
    const pending = await this.paymentModel
      .find({
        studentId: student._id,
        status: 'PENDING',
        period: { $exists: true },
        deletedAt: { $exists: false },
      })
      .sort({ period: 1 })
      .select('concept period dueDate amount')
      .lean();
    return {
      studentId: String(student._id),
      name: student.name,
      paymentDay: student.paymentDay ?? 10,
      monthlyFee: student.monthlyFee,
      pending: pending.map((p) => ({
        concept: p.concept,
        period: p.period,
        dueDate: p.dueDate,
        amount: p.amount,
      })),
    };
  }

  /**
   * Una venta en caja con productos de cuota (p. ej. "mes cerámica") a un
   * cliente que es alumno: cada unidad paga su cuota pendiente más vieja; si
   * no debe nada, adelanta el mes siguiente sin cuota. Nunca lanza: un error
   * acá no tiene que tumbar la venta.
   */
  async payFeesFromSale(input: {
    clientId: string;
    saleId: string;
    saleNumber: string;
    method?: string;
    units: number[];
  }): Promise<number> {
    try {
      if (!input.units.length || !Types.ObjectId.isValid(input.clientId)) return 0;
      const student = await this.studentModel
        .findOne({ clientId: input.clientId, deletedAt: { $exists: false } })
        .select('_id paymentDay monthlyFee')
        .lean();
      if (!student) return 0;
      const now = new Date();
      const note = `Cobrada en caja · venta ${input.saleNumber}`;
      for (const amount of input.units) {
        const pending = await this.paymentModel
          .findOne({
            studentId: student._id,
            status: 'PENDING',
            period: { $exists: true },
            deletedAt: { $exists: false },
          })
          .sort({ period: 1 })
          .exec();
        if (pending) {
          // Menos que la cuota = pago parcial: queda el saldo pendiente.
          await this.applyToPending(pending, amount, {
            method: input.method,
            notes: note,
            saleId: input.saleId,
            now,
          });
          continue;
        }
        // Sin cuotas pendientes: paga el primer mes (desde el actual) que
        // todavía no tiene cuota.
        let period = periodOf(now);
        while (
          await this.paymentModel.exists({
            studentId: student._id,
            period,
            deletedAt: { $exists: false },
          })
        ) {
          period = nextPeriod(period);
        }
        // Adelanto de una parte de la cuota: el resto queda pendiente.
        const fee = round2(student.monthlyFee ?? 0);
        const partial = fee > 0 && amount < fee - 0.01;
        const concept = `Cuota ${monthLabelEs(period)}`;
        const dueDate = dueDateOf(period, student.paymentDay);
        await this.paymentModel.create({
          studentId: student._id,
          concept: partial ? `${concept} · pago parcial` : concept,
          amount,
          status: 'PAID',
          paidAt: now,
          dueDate,
          period,
          method: input.method,
          notes: note,
          saleId: new Types.ObjectId(input.saleId),
        });
        if (partial) {
          await this.paymentModel.create({
            studentId: student._id,
            concept: `${concept} · saldo`,
            amount: round2(fee - amount),
            status: 'PENDING',
            dueDate,
            period,
          });
        }
      }
      await this.recordRegularity(student._id as Types.ObjectId, 'PAYMENT_UPDATED');
      return input.units.length;
    } catch (err) {
      this.logger.error(
        `Venta ${input.saleNumber}: no se pudo registrar la cuota del alumno: ${String(err)}`,
      );
      return 0;
    }
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
        .select('name schedule studentIds hasMonthlyPiece')
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
    // Quien cursa sólo en grupos sin pieza del mes (la Escuelita) no va en la
    // planilla; si además está en el taller, sí.
    const takes = new Map<string, boolean>();
    for (const g of groups) {
      const t = takesMonthlyPiece(g);
      for (const sid of g.studentIds) {
        const k = hex(sid);
        takes.set(k, (takes.get(k) ?? false) || t);
      }
    }
    const isAdmin = actor?.role === UserRole.ADMIN;
    return students
      .filter((s) => takes.get(hex(s._id)) !== false)
      .map((s) => ({
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
    const current = await this.monthlyPieceModel
      .findOne({ studentId: student._id, month })
      .lean();
    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    if (dto.pieceName !== undefined) {
      set.pieceName = dto.pieceName.trim();
      if (set.pieceName && !current?.requestedAt) set.requestedAt = new Date();
    }
    // Fresca y bizcocho se excluyen: prender una apaga la otra.
    if (dto.bisque !== undefined) {
      set.bisque = dto.bisque;
      if (dto.bisque) set.fresh = false;
    }
    if (dto.fresh !== undefined) {
      set.fresh = dto.fresh;
      if (dto.fresh) set.bisque = false;
    }
    if (dto.dueDate !== undefined) {
      if (dto.dueDate) set.dueDate = dto.dueDate;
      else unset.dueDate = 1;
    }
    if (dto.delivered !== undefined) set.delivered = dto.delivered;
    if (dto.ready !== undefined) {
      set.ready = dto.ready;
      if (dto.ready) set.readyAt = new Date();
      else unset.readyAt = 1;
    }
    if (dto.notes !== undefined) set.notes = dto.notes.trim();
    // Plata: sólo admin. Un profesor que mande estos campos los ignora.
    if (isAdmin) {
      if (dto.extraCharge !== undefined) set.extraCharge = dto.extraCharge;
      if (dto.extraAmount !== undefined) set.extraAmount = dto.extraAmount;

      // Cobrar el adicional = registrar un pago del alumno (queda en su
      // historial). Se puede deshacer 24 hs: se anula ese pago.
      if (dto.paid === true && !current?.paid) {
        const amount = dto.extraAmount ?? current?.extraAmount ?? 0;
        const extra = dto.extraCharge ?? current?.extraCharge ?? false;
        if (!extra || amount <= 0) {
          throw new BadRequestException(
            'Para cobrar, marcá el adicional y cargá el monto.',
          );
        }
        const payment = await this.addPayment(
          id,
          {
            concept: `Adicional pieza ${monthLabelEs(month)}`,
            amount,
            status: 'PAID',
            method: dto.paymentMethod,
            notes: current?.pieceName
              ? `Pieza: ${current.pieceName}`
              : undefined,
          },
          actor?.id,
        );
        set.paid = true;
        set.paidAt = new Date();
        set.paymentId = payment._id;
      } else if (dto.paid === false && current?.paid) {
        const paidAt = current.paidAt ? new Date(current.paidAt).getTime() : 0;
        if (paidAt && Date.now() - paidAt > UNDO_PAID_MS) {
          throw new BadRequestException(
            'Pasaron más de 24 hs del cobro: anulalo desde los pagos del alumno.',
          );
        }
        if (current.paymentId) {
          try {
            await this.removePayment(String(current.paymentId));
          } catch (e) {
            if (!(e instanceof NotFoundException)) throw e;
          }
        }
        set.paid = false;
        unset.paidAt = 1;
        unset.paymentId = 1;
      }
    }
    if (actor?.id && Types.ObjectId.isValid(actor.id)) {
      set.updatedById = new Types.ObjectId(actor.id);
    }
    const doneBy =
      dto.doneBy?.trim() ||
      (actor?.id && Types.ObjectId.isValid(actor.id)
        ? (await this.userModel.findById(actor.id).select('name').lean())?.name
        : undefined);
    if (doneBy) set.updatedByName = doneBy;
    const update: Record<string, unknown> = {
      $set: set,
      // Fila nueva: `fresh` explícito, así no se deduce como en las viejas.
      $setOnInsert: {
        studentId: student._id,
        month,
        ...(set.fresh === undefined ? { fresh: false } : {}),
      },
    };
    if (Object.keys(unset).length) update.$unset = unset;
    const row = await this.monthlyPieceModel
      .findOneAndUpdate({ studentId: student._id, month }, update, {
        new: true,
        upsert: true,
      })
      .lean();
    if (row && !row.notifiedAt && row.pieceName && (row.fresh || row.bisque)) {
      await this.notifyProduction(student.name, row, 'new');
    } else if (
      row?.notifiedAt &&
      !row.delivered &&
      !row.ready &&
      dto.dueDate &&
      dto.dueDate !== current?.dueDate &&
      // Sólo si se carga por primera vez o se adelanta: atrasarla no apura.
      (!current?.dueDate || dto.dueDate < current.dueDate)
    ) {
      await this.notifyProduction(student.name, row, 'date');
    }
    return this.monthlyPieceView(row, isAdmin);
  }

  /** Producción marca una pieza como lista (la terminó) o la desmarca. */
  async setPieceReady(pieceId: string, ready: boolean) {
    if (!Types.ObjectId.isValid(pieceId))
      throw new BadRequestException('id inválido');
    const row = await this.monthlyPieceModel
      .findByIdAndUpdate(
        pieceId,
        ready
          ? { $set: { ready: true, readyAt: new Date() } }
          : { $set: { ready: false }, $unset: { readyAt: 1 } },
        { new: true },
      )
      .lean();
    if (!row) throw new NotFoundException('Pieza no encontrada');
    return this.monthlyPieceView(row, false);
  }

  /**
   * Aviso a Producción (cuentas con la vista 'produccion') cuando la pieza
   * queda pedida: con nombre y fresca o bizcocho. Una sola vez por pieza.
   */
  private async notifyProduction(
    studentName: string,
    row: StudentMonthlyPiece & { _id: unknown },
    kind: 'new' | 'date',
  ) {
    if (kind === 'new') {
      await this.monthlyPieceModel.updateOne(
        { _id: row._id },
        { $set: { notifiedAt: new Date() } },
      );
    }
    const users = await this.userModel
      .find({ allowedViews: 'produccion', deletedAt: { $exists: false } })
      .select('_id')
      .lean();
    if (!users.length) return;
    const para = row.dueDate
      ? ` · para el ${DateTime.fromISO(row.dueDate).setLocale('es').toFormat('cccc d/M')}`
      : '';
    try {
      await this.inAppNotifications.create({
        type: 'INFO',
        title:
          kind === 'new'
            ? `Pieza pedida: ${row.pieceName}`
            : `Cambió la fecha: ${row.pieceName}`,
        body:
          kind === 'new'
            ? `${studentName} · ${row.bisque ? 'Bizcocho' : 'Fresca'}${para}`
            : `${studentName} · ahora${para}`,
        targetUserIds: users.map((u) => String(u._id)),
      });
    } catch (e) {
      this.logger.warn(`No se pudo avisar a Producción: ${String(e)}`);
    }
  }

  /**
   * Lista de Producción: piezas pedidas (todas las de los alumnos), en el
   * orden en que se pidieron. Por defecto, sólo las que faltan entregar.
   */
  async productionList(includeDelivered = false) {
    const filter: Record<string, unknown> = { pieceName: { $nin: ['', null] } };
    if (!includeDelivered) filter.delivered = { $ne: true };
    const rows = await this.monthlyPieceModel
      .find(filter)
      .sort({ ready: 1, requestedAt: 1, createdAt: 1 })
      .limit(500)
      .lean();
    const ids = rows.map((r) => r.studentId);
    const [students, groups] = await Promise.all([
      this.studentModel
        .find({ _id: { $in: ids }, deletedAt: { $exists: false } })
        .select('name')
        .lean(),
      this.groupModel
        .find({ studentIds: { $in: ids }, deletedAt: { $exists: false } })
        .select('name schedule studentIds')
        .lean(),
    ]);
    const hex = (v: unknown) => (v as Types.ObjectId).toHexString();
    const nameOf = new Map(students.map((s) => [hex(s._id), s.name]));
    const groupsOf = new Map<string, { name: string; schedule: unknown[] }[]>();
    for (const g of groups) {
      for (const sid of g.studentIds) {
        const arr = groupsOf.get(hex(sid)) ?? [];
        arr.push({ name: g.name, schedule: g.schedule });
        groupsOf.set(hex(sid), arr);
      }
    }
    return rows
      .filter((r) => nameOf.has(hex(r.studentId)))
      .map((r) => ({
        student: { _id: hex(r.studentId), name: nameOf.get(hex(r.studentId)) },
        groups: groupsOf.get(hex(r.studentId)) ?? [],
        piece: this.monthlyPieceView(r, false),
      }));
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
      fresh: r.fresh ?? (!!r.pieceName && !r.bisque),
      requestedAt: r.requestedAt ?? (r as { createdAt?: Date }).createdAt,
      dueDate: r.dueDate,
      ready: r.ready ?? false,
      readyAt: r.readyAt,
      delivered: r.delivered ?? false,
      notes: r.notes,
      updatedByName: r.updatedByName,
      // El adicional y su cobro son datos administrativos.
      ...(isAdmin
        ? {
            extraCharge: r.extraCharge ?? false,
            extraAmount: r.extraAmount,
            paid: r.paid ?? false,
            paidAt: r.paidAt,
            paymentId: r.paymentId ? String(r.paymentId) : undefined,
            // Hasta cuándo se puede deshacer el cobro desde el panel.
            undoUntil:
              r.paid && r.paidAt
                ? new Date(new Date(r.paidAt).getTime() + UNDO_PAID_MS)
                : undefined,
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

/** Ventana para deshacer el cobro de un adicional desde el panel. */
const UNDO_PAID_MS = 24 * 60 * 60 * 1000;

const MESES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** 'YYYY-MM' del mes en curso (hora de Argentina). */
/** Sufijo de la cuota que quedó pendiente por el saldo de un pago parcial. */
const BALANCE_SUFFIX = / · saldo$/;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function periodOf(date: Date): string {
  return DateTime.fromJSDate(date, { zone: envConfig.timezone }).toFormat('yyyy-MM');
}

function nextPeriod(ym: string): string {
  return DateTime.fromISO(`${ym}-01`).plus({ months: 1 }).toFormat('yyyy-MM');
}

/** Fin del día límite de pago del mes (default el 10; ajusta meses cortos). */
function dueDateOf(ym: string, paymentDay?: number): Date {
  const first = DateTime.fromISO(`${ym}-01`, { zone: envConfig.timezone });
  const day = Math.min(paymentDay ?? 10, first.daysInMonth ?? 28);
  return first.set({ day }).endOf('day').toJSDate();
}

function monthLabelEs(ym: string): string {
  const m = MESES_ES[Number(ym.slice(5, 7)) - 1] ?? ym;
  return `${m} ${ym.slice(0, 4)}`;
}

function assertMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new BadRequestException('El mes va en formato YYYY-MM.');
  }
}
