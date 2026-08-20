import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Student, StudentDocument } from '../common/schemas/student.schema';
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
    @InjectModel(StudentPayment.name)
    private readonly paymentModel: Model<StudentPaymentDocument>,
    @InjectModel(Attendance.name)
    private readonly attendanceModel: Model<AttendanceDocument>,
    @InjectModel(Group.name)
    private readonly groupModel: Model<GroupDocument>,
    @InjectModel(Piece.name)
    private readonly pieceModel: Model<PieceDocument>,
  ) {}

  // ── Alumnos ──────────────────────────────────────────────────────────────

  async list(includeInactive = false) {
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (!includeInactive) filter.isActive = true;
    return this.studentModel.find(filter).sort({ name: 1 }).lean();
  }

  async create(dto: CreateStudentDto) {
    return this.studentModel.create({
      ...dto,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      joinedAt: dto.joinedAt ? new Date(dto.joinedAt) : new Date(),
    });
  }

  async update(id: string, dto: UpdateStudentDto) {
    const student = await this.findOrThrow(id);
    const { birthDate, joinedAt, ...rest } = dto;
    Object.assign(student, rest);
    if (birthDate !== undefined)
      student.birthDate = birthDate ? new Date(birthDate) : undefined;
    if (joinedAt !== undefined && joinedAt)
      student.joinedAt = new Date(joinedAt);
    student.updatedAt = new Date();
    await student.save();
    return student;
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
  async practicalProfile(id: string) {
    const student = await this.findOrThrow(id);
    const sid = student._id as Types.ObjectId;
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
    const [groups, payments] = await Promise.all([
      this.groupModel
        .find({ studentIds: sid, deletedAt: { $exists: false } })
        .sort({ name: 1 })
        .lean(),
      this.paymentModel
        .find({ studentId: sid, deletedAt: { $exists: false } })
        .sort({ createdAt: -1 })
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
    };
  }

  // ── Pagos ────────────────────────────────────────────────────────────────

  async addPayment(
    studentId: string,
    dto: CreateStudentPaymentDto,
    userId?: string,
  ) {
    const student = await this.findOrThrow(studentId);
    return this.paymentModel.create({
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
      createdById: userId && Types.ObjectId.isValid(userId) ? userId : undefined,
    });
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
  async saveAttendance(dto: SaveAttendanceDto, userId?: string) {
    if (!Types.ObjectId.isValid(dto.groupId))
      throw new BadRequestException('groupId inválido');
    const records = dto.records.map((r) => ({
      studentId: new Types.ObjectId(r.studentId),
      status: r.status,
      notes: r.notes,
    }));
    return this.attendanceModel.findOneAndUpdate(
      { groupId: new Types.ObjectId(dto.groupId), dateKey: dto.date },
      {
        $set: {
          records,
          takenById:
            userId && Types.ObjectId.isValid(userId) ? userId : undefined,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true },
    );
  }

  async attendanceOfGroup(groupId: string, limit = 30) {
    if (!Types.ObjectId.isValid(groupId))
      throw new BadRequestException('groupId inválido');
    return this.attendanceModel
      .find({ groupId: new Types.ObjectId(groupId) })
      .sort({ dateKey: -1 })
      .limit(limit)
      .lean();
  }

  private async findOrThrow(id: string): Promise<StudentDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const student = await this.studentModel.findById(id).exec();
    if (!student || student.deletedAt)
      throw new NotFoundException('Alumno no encontrado');
    return student;
  }
}
