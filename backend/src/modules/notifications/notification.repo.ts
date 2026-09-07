import type { EmailStatus, Notification, PrismaClient } from '@prisma/client';

export interface NewNotification {
  userId: string;
  type: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  emailInfoCard?: { title: string; rows: { label: string; value: string }[] };
}

export interface NotificationRepoPort {
  create(data: NewNotification): Promise<Notification>;
  setEmailStatus(id: string, status: EmailStatus): Promise<void>;
  listForUser(userId: string, limit?: number): Promise<Notification[]>;
  countUnread(userId: string): Promise<number>;
  markRead(userId: string, id: string): Promise<boolean>;
  markUnread(userId: string, id: string): Promise<boolean>;
  markAllRead(userId: string): Promise<void>;
}

export class PrismaNotificationRepo implements NotificationRepoPort {
  constructor(private readonly client: PrismaClient) {}

  create(data: NewNotification): Promise<Notification> {
    return this.client.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        payload: (data.payload ?? {}) as object,
      },
    });
  }

  async setEmailStatus(id: string, status: EmailStatus): Promise<void> {
    await this.client.notification.update({ where: { id }, data: { emailStatus: status } });
  }

  listForUser(userId: string, limit = 200): Promise<Notification[]> {
    return this.client.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  countUnread(userId: string): Promise<number> {
    return this.client.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<boolean> {
    const updated = await this.client.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (updated.count === 1) return true;
    const exists = await this.client.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    return exists !== null;
  }

  async markUnread(userId: string, id: string): Promise<boolean> {
    const updated = await this.client.notification.updateMany({
      where: { id, userId, readAt: { not: null } },
      data: { readAt: null },
    });
    if (updated.count === 1) return true;
    const exists = await this.client.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    return exists !== null;
  }

  async markAllRead(userId: string): Promise<void> {
    await this.client.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
