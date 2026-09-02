import { Types } from 'mongoose';
import { InAppNotificationsService } from './in-app-notifications.service';

describe('InAppNotificationsService', () => {
  it('persists and emits a notification for connected panel clients', async () => {
    const createdAt = new Date();
    const row = {
      _id: new Types.ObjectId(),
      title: 'Cuotas para revisar (1)',
      body: '• Alumno demo: cuota vencida',
      type: 'PAYMENT_DUE',
      readByUserIds: [],
      createdAt,
    };
    const model = { create: jest.fn().mockResolvedValue(row) };
    const service = new InAppNotificationsService(model as any);
    const received: unknown[] = [];
    const subscription = service.stream().subscribe((event) => received.push(event));

    const notification = await service.create({
      title: row.title,
      body: row.body,
      type: 'PAYMENT_DUE',
    });
    subscription.unsubscribe();

    expect(model.create).toHaveBeenCalledWith({
      title: row.title,
      body: row.body,
      type: 'PAYMENT_DUE',
    });
    expect(notification).toMatchObject({ title: row.title, read: false });
    expect(received).toEqual([
      expect.objectContaining({
        type: 'created',
        notification: expect.objectContaining({ title: row.title }),
      }),
    ]);
  });
});
