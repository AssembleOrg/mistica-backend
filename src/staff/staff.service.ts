import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import {
  StaffTask,
  StaffTaskDocument,
} from '../common/schemas/staff-task.schema';
import {
  ShoppingItem,
  ShoppingItemDocument,
} from '../common/schemas/shopping-item.schema';
import { User, UserDocument } from '../common/schemas/user.schema';
import {
  CreateShoppingItemDto,
  CreateStaffTaskDto,
  UpdateShoppingItemDto,
  UpdateStaffTaskDto,
} from '../common/dto/staff.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { InAppNotificationsService } from '../in-app-notifications/in-app-notifications.service';

/**
 * Herramientas internas del equipo: TAREAS asignables a integrantes del
 * personal y LISTA DE COMPRAS del establecimiento. Cualquier cuenta con la
 * vista habilitada puede operar (cargar rápido es la prioridad).
 */
@Injectable()
export class StaffService {
  constructor(
    @InjectModel(StaffTask.name)
    private readonly taskModel: Model<StaffTaskDocument>,
    @InjectModel(ShoppingItem.name)
    private readonly shoppingModel: Model<ShoppingItemDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly notifications: NotificationsService,
    private readonly inAppNotifications: InAppNotificationsService,
  ) {}

  // ── Tareas ───────────────────────────────────────────────────────────────

  async listTasks(status?: 'PENDING' | 'DONE') {
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (status) filter.status = status;
    return this.taskModel
      .find(filter)
      .sort({ status: 1, dueDate: 1, createdAt: -1 })
      .lean();
  }

  async createTask(dto: CreateStaffTaskDto, userId?: string) {
    const data: Record<string, unknown> = {
      title: dto.title,
      description: dto.description,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      createdById:
        userId && Types.ObjectId.isValid(userId) ? userId : undefined,
    };
    if (dto.assigneeUserId) {
      const user = await this.findUser(dto.assigneeUserId);
      data.assigneeUserId = user._id;
      data.assigneeName = user.name ?? user.email;
    }
    const task = await this.taskModel.create(data);
    // Aviso interno best-effort: la tarea sigue creada aunque WhatsApp no esté
    // configurado. El destinatario es el equipo porque las cuentas no guardan
    // teléfono de trabajo individual.
    await this.notifications.notifyTeam(
      `Nueva tarea interna: ${task.title}${task.assigneeName ? ` · asignada a ${task.assigneeName}` : ''}`,
    );
    return task;
  }

  async updateTask(id: string, dto: UpdateStaffTaskDto) {
    const task = await this.findTask(id);
    if (dto.assigneeUserId !== undefined) {
      if (dto.assigneeUserId) {
        const user = await this.findUser(dto.assigneeUserId);
        task.assigneeUserId = user._id as Types.ObjectId;
        task.assigneeName = user.name ?? user.email;
      } else {
        task.assigneeUserId = undefined;
        task.assigneeName = undefined;
      }
    }
    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description;
    if (dto.dueDate !== undefined)
      task.dueDate = dto.dueDate ? new Date(dto.dueDate) : undefined;
    if (dto.status !== undefined) {
      task.status = dto.status;
      task.completedAt = dto.status === 'DONE' ? new Date() : undefined;
    }
    task.updatedAt = new Date();
    await task.save();
    return task;
  }

  async removeTask(id: string) {
    const task = await this.findTask(id);
    task.deletedAt = new Date();
    await task.save();
    return { success: true };
  }

  // ── Lista de compras ─────────────────────────────────────────────────────

  async listShopping(status?: 'PENDING' | 'BOUGHT') {
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (status) filter.status = status;
    return this.shoppingModel
      .find(filter)
      .sort({ status: 1, createdAt: -1 })
      .lean();
  }

  async createShoppingItem(dto: CreateShoppingItemDto, userId?: string) {
    let addedByName: string | undefined;
    if (userId && Types.ObjectId.isValid(userId)) {
      const user = await this.userModel.findById(userId).lean();
      addedByName = user?.name ?? user?.email;
    }
    return this.shoppingModel.create({
      name: dto.name,
      quantity: dto.quantity,
      notes: dto.notes,
      addedById:
        userId && Types.ObjectId.isValid(userId) ? userId : undefined,
      addedByName,
    });
  }

  async updateShoppingItem(id: string, dto: UpdateShoppingItemDto) {
    const item = await this.findShoppingItem(id);
    if (dto.name !== undefined) item.name = dto.name;
    if (dto.quantity !== undefined) item.quantity = dto.quantity;
    if (dto.notes !== undefined) item.notes = dto.notes;
    if (dto.status !== undefined) {
      item.status = dto.status;
      item.boughtAt = dto.status === 'BOUGHT' ? new Date() : undefined;
    }
    item.updatedAt = new Date();
    await item.save();
    return item;
  }

  async removeShoppingItem(id: string) {
    const item = await this.findShoppingItem(id);
    item.deletedAt = new Date();
    await item.save();
    return { success: true };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async findUser(id: string): Promise<UserDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('assigneeUserId inválido');
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('Cuenta no encontrada');
    return user;
  }

  private async findTask(id: string): Promise<StaffTaskDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const task = await this.taskModel.findById(id).exec();
    if (!task || task.deletedAt)
      throw new NotFoundException('Tarea no encontrada');
    return task;
  }

  private async findShoppingItem(id: string): Promise<ShoppingItemDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const item = await this.shoppingModel.findById(id).exec();
    if (!item || item.deletedAt)
      throw new NotFoundException('Ítem no encontrado');
    return item;
  }

  @Cron('10 9 * * *', { timeZone: 'America/Argentina/Buenos_Aires' })
  async dailyTaskFollowUp() {
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const tasks = await this.taskModel.find({
      status: 'PENDING',
      deletedAt: { $exists: false },
      dueDate: { $lte: endOfToday },
      dueReminderSentAt: { $exists: false },
    });
    if (!tasks.length) return;
    const body = tasks
      .map((task) => `• ${task.title}${task.assigneeName ? ` · ${task.assigneeName}` : ''}`)
      .join('\n');
    await this.inAppNotifications.create({
      type: 'TASK_DUE',
      title: `Tareas que requieren atención (${tasks.length})`,
      body,
    });
    await this.notifications.notifyTeam(`Tareas que requieren atención:\n${body}`);
    await this.taskModel.updateMany(
      { _id: { $in: tasks.map((task) => task._id) } },
      { $set: { dueReminderSentAt: new Date() } },
    );
  }
}
