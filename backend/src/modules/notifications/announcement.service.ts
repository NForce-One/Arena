import type { Announcement, PrismaClient } from '@prisma/client';
import type { CreateAnnouncementInput } from '@nforce/shared';
import type { DbClient, TxRunner } from '../../lib/db';
import type { AuditPort } from '../audit/audit.service';
import type { AuthzService } from '../users-auth/authz.service';
import type { UserRepoPort } from '../users-auth/user.repo';
import type { NotificationService } from './notification.service';

export interface AnnouncementRepoPort {
  create(
    data: { title: string; body: string; targetRoles: string[]; createdById: string },
    db?: DbClient,
  ): Promise<Announcement>;
}

export class PrismaAnnouncementRepo implements AnnouncementRepoPort {
  constructor(private readonly client: PrismaClient) {}

  create(
    data: { title: string; body: string; targetRoles: string[]; createdById: string },
    db: DbClient = this.client,
  ): Promise<Announcement> {
    return db.announcement.create({
      data: {
        title: data.title,
        body: data.body,
        targetRoles: data.targetRoles as Announcement['targetRoles'],
        createdById: data.createdById,
      },
    });
  }
}

export interface AnnouncementServiceDeps {
  announcements: AnnouncementRepoPort;
  users: Pick<UserRepoPort, 'listIds'>;
  notifications: NotificationService;
  authz: AuthzService;
  audit: AuditPort;
  tx: TxRunner;
}

export class AnnouncementService {
  constructor(private readonly deps: AnnouncementServiceDeps) {}

  async publish(
    actorId: string,
    input: CreateAnnouncementInput,
    ip?: string,
  ): Promise<{ id: string; recipients: number }> {
    await this.deps.authz.assertRole(actorId, 'platform_admin');
    const targetRoles = input.targetRoles ?? [];

    const announcement = await this.deps.tx.run(async (db) => {
      const row = await this.deps.announcements.create(
        { title: input.title, body: input.body, targetRoles, createdById: actorId },
        db,
      );
      await this.deps.audit.write(
        {
          action: 'announcement.published',
          actorUserId: actorId,
          entityType: 'announcement',
          entityId: row.id,
          meta: { title: input.title, targetRoles },
          ip,
        },
        db,
      );
      return row;
    });

    const recipientIds =
      targetRoles.length > 0
        ? [
            ...new Set(
              (await Promise.all(targetRoles.map((r) => this.deps.users.listIds(r)))).flat(),
            ),
          ]
        : await this.deps.users.listIds(undefined);
    const recipients = await this.deps.notifications.notifyMany(recipientIds, {
      type: 'announcement',
      title: input.title,
      body: input.body,
      payload: { announcementId: announcement.id },
    });

    return { id: announcement.id, recipients };
  }
}
