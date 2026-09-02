import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { filter, Observable, Subject } from 'rxjs';
import { InAppNotification, InAppNotificationDocument } from '../common/schemas/in-app-notification.schema';

export interface InAppNotificationEvent { type: 'created' | 'read'; notification: Record<string, unknown>; }
type Recipient = { userId: string; role: string };

@Injectable()
export class InAppNotificationsService {
  private readonly events = new Subject<InAppNotificationEvent & { recipients: Recipient[] }>();
  constructor(@InjectModel(InAppNotification.name) private readonly model: Model<InAppNotificationDocument>) {}

  stream(user?: Recipient): Observable<InAppNotificationEvent> {
    return this.events.asObservable().pipe(
      filter((event) => !user || event.recipients.some((recipient) => recipient.userId === user.userId)),
      // Los destinatarios son internos; nunca se envían al navegador.
      filter((event) => !!event.notification),
    ) as Observable<InAppNotificationEvent>;
  }

  async create(input: { title: string; body: string; type: InAppNotification['type']; expiresAt?: Date; targetUserIds?: string[]; visibleToRoles?: string[] }) {
    const targetUserIds = [...new Set(input.targetUserIds ?? [])]
      .filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
    const notification = await this.model.create({ ...input, targetUserIds, visibleToRoles: input.visibleToRoles ?? ['admin'] });
    const recipients = await this.recipients(notification);
    this.events.next({ type: 'created', notification: this.view(notification), recipients });
    return this.view(notification);
  }

  async list(user: Recipient, unreadOnly = false) {
    const audience: Record<string, unknown>[] = [
      { targetUserIds: new Types.ObjectId(user.userId) },
      { targetUserIds: { $size: 0 }, visibleToRoles: user.role },
    ];
    // Notificaciones creadas antes de introducir audiencias: eran de administración.
    if (user.role === 'admin') audience.push({ targetUserIds: { $exists: false }, visibleToRoles: { $exists: false } });
    const filter: Record<string, unknown> = { $or: audience };
    if (unreadOnly) filter.readByUserIds = { $ne: new Types.ObjectId(user.userId) };
    const rows = await this.model.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    return rows.map((row) => this.view(row, user.userId));
  }

  async markRead(id: string, user: Recipient) {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(user.userId)) throw new NotFoundException('Notificación no encontrada');
    const rows = await this.list(user, false);
    if (!rows.some((notification) => notification.id === id)) throw new NotFoundException('Notificación no encontrada');
    const notification = await this.model.findByIdAndUpdate(id, { $addToSet: { readByUserIds: new Types.ObjectId(user.userId) } }, { new: true });
    if (!notification) throw new NotFoundException('Notificación no encontrada');
    this.events.next({ type: 'read', notification: this.view(notification, user.userId), recipients: [user] });
    return this.view(notification, user.userId);
  }

  private async recipients(notification: InAppNotificationDocument): Promise<Recipient[]> {
    const targetIds = notification.targetUserIds ?? [];
    if (targetIds.length) return targetIds.map((id) => ({ userId: String(id), role: '' }));
    // Anuncios por rol no se emiten de forma proactiva: el usuario los verá al recargar.
    // Las tareas siempre tienen destinatarios explícitos.
    return [];
  }

  private view(notification: InAppNotificationDocument | Record<string, any>, userId?: string) {
    const readBy = notification.readByUserIds ?? [];
    return { id: String(notification._id), title: notification.title, body: notification.body, type: notification.type, createdAt: notification.createdAt, read: !!userId && readBy.some((id: Types.ObjectId) => String(id) === userId) };
  }
}
