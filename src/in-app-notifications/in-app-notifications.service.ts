import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Observable, Subject } from 'rxjs';
import {
  InAppNotification,
  InAppNotificationDocument,
} from '../common/schemas/in-app-notification.schema';

export interface InAppNotificationEvent {
  type: 'created' | 'read';
  notification: Record<string, unknown>;
}

@Injectable()
export class InAppNotificationsService {
  private readonly events = new Subject<InAppNotificationEvent>();

  constructor(
    @InjectModel(InAppNotification.name)
    private readonly model: Model<InAppNotificationDocument>,
  ) {}

  stream(): Observable<InAppNotificationEvent> {
    return this.events.asObservable();
  }

  async create(input: {
    title: string;
    body: string;
    type: InAppNotification['type'];
    expiresAt?: Date;
  }) {
    const notification = await this.model.create(input);
    const view = this.view(notification, undefined);
    this.events.next({ type: 'created', notification: view });
    return view;
  }

  async list(userId: string, unreadOnly = false) {
    const filter: Record<string, unknown> = {};
    if (unreadOnly && Types.ObjectId.isValid(userId)) {
      filter.readByUserIds = { $ne: new Types.ObjectId(userId) };
    }
    const rows = await this.model.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    return rows.map((row) => this.view(row, userId));
  }

  async markRead(id: string, userId: string) {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Notificación no encontrada');
    }
    const notification = await this.model.findByIdAndUpdate(
      id,
      { $addToSet: { readByUserIds: new Types.ObjectId(userId) } },
      { new: true },
    );
    if (!notification) throw new NotFoundException('Notificación no encontrada');
    const view = this.view(notification, userId);
    this.events.next({ type: 'read', notification: view });
    return view;
  }

  private view(
    notification: InAppNotificationDocument | Record<string, any>,
    userId?: string,
  ) {
    const readBy = notification.readByUserIds ?? [];
    return {
      id: String(notification._id),
      title: notification.title,
      body: notification.body,
      type: notification.type,
      createdAt: notification.createdAt,
      read: !!userId && readBy.some((id: Types.ObjectId) => String(id) === userId),
    };
  }
}
