import {
  BadRequestException,
  ForbiddenException,
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
import { UserRole } from '../common/enums/user-role.enum';

type Actor = { id?: string; role?: string };

const isAdmin = (actor?: Actor) => actor?.role === UserRole.ADMIN;

const actorObjectId = (actor?: Actor) =>
  actor?.id && Types.ObjectId.isValid(actor.id)
    ? new Types.ObjectId(actor.id)
    : null;

/**
 * Herramientas internas del equipo: TAREAS asignables a integrantes del
 * personal y LISTA DE COMPRAS del establecimiento. Las tareas las gestiona el
 * admin; cada integrante ve las suyas y suma su progreso. La lista de compras
 * la opera cualquiera con la vista habilitada.
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

  async listTasks(
    status?: 'PENDING' | 'IN_PROGRESS' | 'DONE',
    actor?: Actor,
  ) {
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (status) filter.status = status;
    // Cada integrante ve sólo sus tareas; el admin, todas.
    if (!isAdmin(actor)) {
      const me = actorObjectId(actor);
      if (!me) return [];
      filter.$or = [{ 'assignees.userId': me }, { assigneeUserId: me }];
    }
    return this.taskModel
      .find(filter)
      .sort({ status: 1, dueDate: 1, createdAt: -1 })
      .lean()
      .then((tasks) => tasks.map((task) => ({ ...task, assignees: task.assignees?.length ? task.assignees : (task.assigneeUserId && task.assigneeName ? [{ userId: task.assigneeUserId, name: task.assigneeName }] : []) })));
  }

  async createTask(dto: CreateStaffTaskDto, userId?: string) {
    const data: Record<string, unknown> = {
      title: dto.title,
      description: dto.description,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      createdById:
        userId && Types.ObjectId.isValid(userId) ? userId : undefined,
    };
    const assignees = await this.resolveAssignees(dto);
    if (assignees.length) {
      data.assignees = assignees;
      // Compatibilidad con registros/clientes anteriores.
      data.assigneeUserId = assignees[0].userId;
      data.assigneeName = assignees[0].name;
    }
    const task = await this.taskModel.create(data);
    await this.notifyAssignees(task, assignees.map((assignee) => String(assignee.userId)), 'Nueva tarea asignada');
    await this.notifications.notifyTeam(`Nueva tarea interna: ${task.title}${assignees.length ? ` · asignada a ${assignees.map((a) => a.name).join(', ')}` : ''}`);
    return task;
  }

  async updateTask(id: string, dto: UpdateStaffTaskDto, actor?: Actor) {
    const task = await this.findTask(id);
    // Quien no es admin sólo marca hecha / reabre una tarea suya.
    if (!isAdmin(actor)) {
      this.assertOwnTask(task, actor);
      const touched = Object.entries(dto)
        .filter(([, v]) => v !== undefined)
        .map(([k]) => k);
      if (touched.some((k) => k !== 'status')) {
        throw new ForbiddenException(
          'Sólo el admin puede editar la tarea. Vos podés marcarla hecha y sumar tu progreso.',
        );
      }
    }
    let newAssigneeIds: string[] = [];
    if (dto.assigneeUserIds !== undefined || dto.assigneeUserId !== undefined) {
      const assignees = await this.resolveAssignees(dto);
      const oldIds = this.taskAssignees(task).map((assignee) => String(assignee.userId));
      newAssigneeIds = assignees.map((assignee) => String(assignee.userId)).filter((id) => !oldIds.includes(id));
      task.assignees = assignees;
      task.assigneeUserId = assignees[0]?.userId;
      task.assigneeName = assignees[0]?.name;
    }
    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description;
    if (dto.dueDate !== undefined)
      task.dueDate = dto.dueDate ? new Date(dto.dueDate) : undefined;
    if (dto.status !== undefined && dto.status !== task.status) {
      task.status = dto.status;
      task.completedAt = dto.status === 'DONE' ? new Date() : undefined;
      // Al completarla se conserva cuándo se empezó; al volver a pendiente, no.
      if (dto.status === 'IN_PROGRESS') task.startedAt = new Date();
      if (dto.status === 'PENDING') task.startedAt = undefined;
    }
    task.updatedAt = new Date();
    await task.save();
    if (newAssigneeIds.length) await this.notifyAssignees(task, newAssigneeIds, 'Te asignaron una tarea');
    return task;
  }

  async removeTask(id: string) {
    const task = await this.findTask(id);
    task.deletedAt = new Date();
    await task.save();
    return { success: true };
  }

  async addTaskComment(id: string, body: string, actor?: Actor) {
    const task = await this.findTask(id);
    if (!isAdmin(actor)) this.assertOwnTask(task, actor);
    const userId = actor?.id;
    const cleanBody = body.trim();
    if (!cleanBody) throw new BadRequestException('El comentario está vacío');
    const author = userId && Types.ObjectId.isValid(userId)
      ? await this.userModel.findById(userId).lean()
      : null;
    task.comments.push({
      authorUserId: author?._id as Types.ObjectId | undefined,
      authorName: author?.name ?? author?.email ?? 'Integrante del equipo',
      body: cleanBody,
      createdAt: new Date(),
    } as never);
    task.updatedAt = new Date();
    await task.save();
    return task;
  }

  // ── Lista de compras ─────────────────────────────────────────────────────

  /**
   * Lista de compras. El admin ve todo; el resto, sólo lo que pidió desde su
   * cuenta (así la profe no ve mezclado lo de cocina, y viceversa).
   */
  async listShopping(status?: 'PENDING' | 'BOUGHT', actor?: Actor) {
    const filter: Record<string, unknown> = { deletedAt: { $exists: false } };
    if (status) filter.status = status;
    if (!isAdmin(actor)) filter.addedById = actorObjectId(actor);
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
      requestedByName: dto.requestedBy?.trim() || addedByName,
    });
  }

  async updateShoppingItem(
    id: string,
    dto: UpdateShoppingItemDto,
    actor?: Actor,
  ) {
    const item = await this.findShoppingItem(id);
    this.assertOwnShoppingItem(item, actor);
    if (dto.name !== undefined) item.name = dto.name;
    if (dto.quantity !== undefined) item.quantity = dto.quantity;
    if (dto.notes !== undefined) item.notes = dto.notes;
    if (dto.requestedBy !== undefined)
      item.requestedByName = dto.requestedBy.trim() || item.addedByName;
    if (dto.status !== undefined) {
      item.status = dto.status;
      item.boughtAt = dto.status === 'BOUGHT' ? new Date() : undefined;
    }
    item.updatedAt = new Date();
    await item.save();
    return item;
  }

  async removeShoppingItem(id: string, actor?: Actor) {
    const item = await this.findShoppingItem(id);
    this.assertOwnShoppingItem(item, actor);
    item.deletedAt = new Date();
    await item.save();
    return { success: true };
  }

  /** Quien no es admin sólo toca lo que cargó desde su cuenta. */
  private assertOwnShoppingItem(
    item: { addedById?: Types.ObjectId },
    actor?: Actor,
  ) {
    if (isAdmin(actor)) return;
    const me = actorObjectId(actor);
    if (!me || !item.addedById || !item.addedById.equals(me)) {
      throw new ForbiddenException('Ese ítem lo cargó otra cuenta.');
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private assertOwnTask(task: StaffTaskDocument, actor?: Actor) {
    const mine = this.taskAssignees(task).some(
      (a) => String(a.userId) === actor?.id,
    );
    if (!mine) throw new ForbiddenException('Esta tarea no está asignada a vos.');
  }

  private taskAssignees(task: StaffTaskDocument) {
    if (task.assignees?.length) return task.assignees;
    return task.assigneeUserId && task.assigneeName ? [{ userId: task.assigneeUserId, name: task.assigneeName }] : [];
  }

  private async resolveAssignees(dto: Pick<CreateStaffTaskDto, 'assigneeUserIds' | 'assigneeUserId'>) {
    const ids = [...new Set(dto.assigneeUserIds ?? (dto.assigneeUserId ? [dto.assigneeUserId] : []))];
    return Promise.all(ids.map(async (id) => {
      const user = await this.findUser(id);
      return { userId: user._id as Types.ObjectId, name: user.name ?? user.email };
    }));
  }

  private async notifyAssignees(task: StaffTaskDocument, userIds: string[], prefix: string) {
    if (!userIds.length) return;
    const due = task.dueDate ? ` · límite ${task.dueDate.toLocaleDateString('es-AR')}` : '';
    await this.inAppNotifications.create({
      type: 'INFO', title: prefix, body: `${task.title}${due}`, targetUserIds: userIds,
    });
  }

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
      status: { $in: ['PENDING', 'IN_PROGRESS'] },
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
