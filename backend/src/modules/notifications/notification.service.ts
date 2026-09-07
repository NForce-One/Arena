import type { NotificationDto } from '@nforce/shared';
import type { EmailAdapter } from '../../adapters/email/EmailAdapter';
import { NotFoundError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { UserRepoPort } from '../users-auth/user.repo';
import type { NewNotification, NotificationRepoPort } from './notification.repo';

export interface NotificationServiceDeps {
  notifications: NotificationRepoPort;
  users: Pick<UserRepoPort, 'findById'>;
  email: EmailAdapter;
}

export class NotificationService {
  constructor(private readonly deps: NotificationServiceDeps) {}

  async notify(data: NewNotification): Promise<void> {
    const subject = await this.deps.users.findById(data.userId);
    let targetUserId = data.userId;
    let payload = data.payload;
    let targetUser = subject;
    if (subject?.managedByParentId) {
      targetUserId = subject.managedByParentId;
      payload = { ...data.payload, childId: subject.id, childName: subject.name };
      targetUser = await this.deps.users.findById(targetUserId);
    }

    const row = await this.deps.notifications.create({ ...data, userId: targetUserId, payload });
    try {
      const user = targetUser;
      if (!user) return;
      const result = await this.deps.email.sendNotificationEmail({
        to: user.email,
        subject: data.title,
        body: data.body,
        infoCard: data.emailInfoCard,
      });
      if (!result.ok) {
        logger.error(
          { reason: result.reason, notificationId: row.id, to: user.email },
          'Notification email rejected by provider (in-app kept)',
        );
      }
      await this.deps.notifications.setEmailStatus(row.id, result.ok ? 'sent' : 'failed');
    } catch (err) {
      logger.error({ err, notificationId: row.id }, 'Notification email failed (in-app kept)');
      try {
        await this.deps.notifications.setEmailStatus(row.id, 'failed');
      } catch {
      }
    }
  }

  async notifyMany(userIds: string[], data: Omit<NewNotification, 'userId'>): Promise<number> {
    const effectiveIds = new Set<string>();
    for (const userId of userIds) {
      const user = await this.deps.users.findById(userId);
      effectiveIds.add(user?.managedByParentId ?? userId);
    }
    for (const userId of effectiveIds) {
      await this.notify({ ...data, userId });
    }
    return effectiveIds.size;
  }

  async listFor(userId: string): Promise<{ notifications: NotificationDto[]; unread: number }> {
    const [rows, unread] = await Promise.all([
      this.deps.notifications.listForUser(userId),
      this.deps.notifications.countUnread(userId),
    ]);
    return {
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        payload: n.payload as Record<string, unknown>,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      })),
      unread,
    };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const ok = await this.deps.notifications.markRead(userId, id);
    if (!ok) throw new NotFoundError('Notification not found');
  }

  async markUnread(userId: string, id: string): Promise<void> {
    const ok = await this.deps.notifications.markUnread(userId, id);
    if (!ok) throw new NotFoundError('Notification not found');
  }

  markAllRead(userId: string): Promise<void> {
    return this.deps.notifications.markAllRead(userId);
  }
}
