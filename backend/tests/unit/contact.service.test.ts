import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { ContactService } from '../../src/modules/contact/contact.service';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import { UsersService } from '../../src/modules/users-auth/users.service';
import {
  FakeAdminVerificationSender,
  FakeAudit,
  FakeContactMessageRepo,
  FakeNotificationRepo,
  FakeStorageAdapter,
  FakeUserRepo,
  MailboxAdapter,
  fakeTx,
} from '../helpers/fakes';

async function seedUser(users: FakeUserRepo, email: string, roleIds: number[]) {
  return users.create({
    name: email.split('@')[0]!,
    email,
    passwordHash: await hash('x'),
    roleIds,
  });
}

describe('ContactService', () => {
  let users: FakeUserRepo;
  let contactMessages: FakeContactMessageRepo;
  let audit: FakeAudit;
  let notificationRepo: FakeNotificationRepo;
  let service: ContactService;
  let adminId: string;
  let playerId: string;

  beforeEach(async () => {
    users = new FakeUserRepo();
    contactMessages = new FakeContactMessageRepo(users);
    audit = new FakeAudit();
    notificationRepo = new FakeNotificationRepo();
    const authz = new AuthzService(users);
    const notifications = new NotificationService({
      notifications: notificationRepo,
      users,
      email: new MailboxAdapter(),
    });
    const usersService = new UsersService({
      users,
      authz,
      audit,
      tx: fakeTx,
      auth: new FakeAdminVerificationSender(),
      storage: new FakeStorageAdapter(),
      notifications,
    });
    service = new ContactService({
      contactMessages,
      users: usersService,
      authz,
      notifications,
      audit,
      tx: fakeTx,
    });

    adminId = (await seedUser(users, 'admin@example.com', [1])).id;
    playerId = (await seedUser(users, 'player@example.com', [3])).id;
  });

  it('submit creates an open message and notifies every admin, without auditing the submission', async () => {
    const secondAdminId = (await seedUser(users, 'second-admin@example.com', [1])).id;
    const message = await service.submit(playerId, {
      subject: 'Booking issue',
      message: 'My ground booking disappeared.',
    });

    expect(message).toMatchObject({
      userId: playerId,
      subject: 'Booking issue',
      status: 'open',
      resolvedAt: null,
    });
    expect(audit.entries).toHaveLength(0);

    const notifiedAdminIds = [...notificationRepo.rows.values()]
      .filter((n) => n.type === 'contact_message_submitted')
      .map((n) => n.userId)
      .sort();
    expect(notifiedAdminIds).toEqual([adminId, secondAdminId].sort());
  });

  it('a non-admin cannot list or resolve messages', async () => {
    const message = await service.submit(playerId, { subject: 'Hi', message: 'Help please' });
    await expect(service.listAll(playerId)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(service.resolve(playerId, message.id)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
  });

  it('listAll (admin) returns every message, newest first', async () => {
    const first = await service.submit(playerId, { subject: 'First', message: 'One' });
    const second = await service.submit(playerId, { subject: 'Second', message: 'Two' });

    const all = await service.listAll(adminId);
    expect(all.map((m) => m.id)).toEqual([second.id, first.id]);
  });

  it('resolve marks the message resolved and writes an audited contact.resolved entry', async () => {
    const message = await service.submit(playerId, { subject: 'Hi', message: 'Help please' });
    const resolved = await service.resolve(adminId, message.id);

    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedAt).not.toBeNull();
    expect(audit.actionsOf('contact.resolved')).toHaveLength(1);
    expect(audit.actionsOf('contact.resolved')[0]!).toMatchObject({
      actorUserId: adminId,
      entityId: message.id,
      meta: { subject: 'Hi', targetUserId: playerId },
    });
  });

  it('resolving a nonexistent message is a 404', async () => {
    await expect(service.resolve(adminId, 'nope')).rejects.toMatchObject({
      status: 404,
    });
  });
});
