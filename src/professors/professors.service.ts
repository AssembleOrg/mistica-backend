import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Professor,
  ProfessorDocument,
} from '../common/schemas/professor.schema';
import { User, UserDocument } from '../common/schemas/user.schema';
import {
  CreateProfessorDto,
  UpdateProfessorDto,
} from '../common/dto/professor.dto';

/** Profesor con los datos de su cuenta vinculada (para el panel). */
export interface ProfessorView {
  id: string;
  name: string;
  phone?: string;
  emergencyPhone?: string;
  email?: string;
  notes?: string;
  active: boolean;
  userId?: string;
  /** Email de la cuenta de acceso vinculada, si existe y está viva. */
  accountEmail?: string;
  createdAt: Date;
}

@Injectable()
export class ProfessorsService implements OnModuleInit {
  constructor(
    @InjectModel(Professor.name)
    private readonly model: Model<ProfessorDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /** Asegura que las cuentas de profesoras existentes puedan ver Alumnos y grupos. */
  async onModuleInit() {
    const linked = await this.model
      .find({ userId: { $exists: true }, deletedAt: { $exists: false } })
      .distinct('userId');
    if (linked.length) {
      await this.userModel.updateMany(
        { _id: { $in: linked }, 'allowedViews.0': { $exists: true } },
        { $addToSet: { allowedViews: 'alumnos' } },
      );
    }
  }

  async list(): Promise<ProfessorView[]> {
    const rows = await this.model
      .find({ deletedAt: { $exists: false } })
      .sort({ active: -1, name: 1 })
      .lean();

    // Emails de las cuentas vinculadas en una sola pasada.
    const userIds = rows.filter((r) => r.userId).map((r) => r.userId);
    const users = userIds.length
      ? await this.userModel
          .find({ _id: { $in: userIds }, deletedAt: { $exists: false } })
          .select('email')
          .lean()
      : [];
    const emailById = new Map(users.map((u) => [String(u._id), u.email]));

    return rows.map((r) => ({
      id: String(r._id),
      name: r.name,
      phone: r.phone,
      emergencyPhone: r.emergencyPhone,
      email: r.email,
      notes: r.notes,
      active: r.active,
      userId: r.userId ? String(r.userId) : undefined,
      accountEmail: r.userId ? emailById.get(String(r.userId)) : undefined,
      createdAt: r.createdAt,
    }));
  }

  async create(dto: CreateProfessorDto): Promise<ProfessorDocument> {
    const professor = await this.model.create({
      ...dto,
      userId: dto.userId ? new Types.ObjectId(dto.userId) : undefined,
    });
    if (professor.userId) await this.grantGroupsAccess(professor.userId);
    return professor;
  }

  async update(id: string, dto: UpdateProfessorDto): Promise<ProfessorDocument> {
    const prof = await this.findOrThrow(id);
    const { userId, ...rest } = dto;
    Object.assign(prof, rest, { updatedAt: new Date() });
    if (userId !== undefined) {
      prof.userId = userId ? new Types.ObjectId(userId) : undefined;
      if (prof.userId) await this.grantGroupsAccess(prof.userId);
    }
    await prof.save();
    return prof;
  }

  private async grantGroupsAccess(userId: Types.ObjectId) {
    await this.userModel.updateOne(
      { _id: userId, 'allowedViews.0': { $exists: true } },
      { $addToSet: { allowedViews: 'alumnos' } },
    );
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const prof = await this.findOrThrow(id);
    prof.deletedAt = new Date();
    prof.active = false;
    await prof.save();
    return { success: true };
  }

  /** Nombre de un profesor activo (para el snapshot de la pieza). */
  async nameOf(id: string): Promise<string> {
    const prof = await this.model
      .findOne({ _id: id, deletedAt: { $exists: false } })
      .select('name')
      .lean();
    if (!prof) throw new BadRequestException('Profesor no encontrado');
    return prof.name;
  }

  async ofUser(userId?: string) {
    if (!userId || !Types.ObjectId.isValid(userId)) return null;
    return this.model
      .findOne({ userId, deletedAt: { $exists: false }, active: true })
      .select('name')
      .lean();
  }

  private async findOrThrow(id: string): Promise<ProfessorDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const prof = await this.model.findById(id).exec();
    if (!prof || prof.deletedAt)
      throw new NotFoundException('Profesor no encontrado');
    return prof;
  }
}
