import type { ContactMessageDto, ContactMessageInput } from '@nforce/shared';
import type { TxRunner } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';
import type { AuditPort } from '../audit/audit.service';
import type { NotificationService } from '../notifications/notification.service';
import type { AuthzService } from '../users-auth/authz.service';
import type { UsersService } from '../users-auth/users.service';
import type { ContactMessageRepoPort, ContactMessageRow } from './contact.repo';

export interface ContactServiceDeps {
  contactMessages: ContactMessageRepoPort;
  users: UsersService;
  authz: AuthzService;
  notifications: NotificationService;
  audit: AuditPort;
  tx: TxRunner;
}

function toDto(row: ContactMessageRow): ContactMessageDto {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    subject: row.subject,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

export class ContactService {
  constructor(private readonly deps: ContactServiceDeps) {}

  async submit(userId: string, input: ContactMessageInput): Promise<ContactMessageDto> {
    const me = await this.deps.users.me(userId);
    const created = await this.deps.contactMessages.create(userId, input);

    const adminIds = await this.deps.users.listAdminIds();
    for (const adminId of adminIds) {
      await this.deps.notifications.notify({
        userId: adminId,
        type: 'contact_message_submitted',
        title: `New message: ${input.subject}`,
        body: `${me.name} sent a message: ${input.message}`,
        payload: { contactMessageId: created.id },
      });
    }

    return toDto(created);
  }

  async listAll(actorId: string): Promise<ContactMessageDto[]> {
    await this.deps.authz.assertRole(actorId, 'platform_admin');
    const rows = await this.deps.contactMessages.listAll();
    return rows.map(toDto);
  }

  async resolve(actorId: string, id: string, ip?: string): Promise<ContactMessageDto> {
    await this.deps.authz.assertRole(actorId, 'platform_admin');
    const existing = await this.deps.contactMessages.findById(id);
    if (!existing) throw new NotFoundError('Message not found');

    const resolved = await this.deps.tx.run(async (db) => {
      const row = await this.deps.contactMessages.resolve(id, actorId, db);
      await this.deps.audit.write(
        {
          action: 'contact.resolved',
          actorUserId: actorId,
          entityType: 'contactMessage',
          entityId: id,
          meta: { subject: existing.subject, targetUserId: existing.userId },
          ip,
        },
        db,
      );
      return row;
    });
    return toDto(resolved);
  }
}
