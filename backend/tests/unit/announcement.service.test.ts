import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { AnnouncementService } from '../../src/modules/notifications/announcement.service';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import {
  FakeAnnouncementRepo,
  FakeAudit,
  FakeNotificationRepo,
  FakeUserRepo,
  MailboxAdapter,
  fakeTx,
} from '../helpers/fakes';

describe('AnnouncementService', () => {
  let users: FakeUserRepo;
  let notificationRepo: FakeNotificationRepo;
  let audit: FakeAudit;
  let service: AnnouncementService;
  let adminId: string;
  let playerId: string;
  let umpireId: string;

  beforeEach(async () => {
    users = new FakeUserRepo();
    notificationRepo = new FakeNotificationRepo();
    audit = new FakeAudit();
    const mailbox = new MailboxAdapter();
    const notifications = new NotificationService({
      notifications: notificationRepo,
      users,
      email: mailbox,
    });
    service = new AnnouncementService({
      announcements: new FakeAnnouncementRepo(),
      users,
      notifications,
      authz: new AuthzService(users),
      audit,
      tx: fakeTx,
    });

    const mk = async (email: string, roleIds: number[]) =>
      (await users.create({ name: email, email, passwordHash: await hash('x'), roleIds })).id;
    adminId = await mk('admin@example.com', [1]);
    playerId = await mk('player@example.com', [3]);
    umpireId = await mk('umpire@example.com', [6]);
  });

  it('only a platform admin can publish', async () => {
    await expect(
      service.publish(playerId, { title: 'Hack', body: 'x', targetRoles: [] }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('publishes to ALL users when no target roles are given, and audits it', async () => {
    const result = await service.publish(adminId, {
      title: 'Season opens',
      body: 'Welcome!',
      targetRoles: [],
    });
    expect(result.recipients).toBe(3);
    expect(notificationRepo.forUser(playerId)).toHaveLength(1);
    expect(notificationRepo.forUser(umpireId)).toHaveLength(1);
    expect(audit.actionsOf('announcement.published')).toHaveLength(1);
  });

  it('publishes only to holders of the target role', async () => {
    const result = await service.publish(adminId, {
      title: 'Umpire briefing',
      body: 'New rules.',
      targetRoles: ['umpire'],
    });
    expect(result.recipients).toBe(1);
    expect(notificationRepo.forUser(umpireId)).toHaveLength(1);
    expect(notificationRepo.forUser(playerId)).toHaveLength(0);
  });

  it('publishes to the UNION of several target roles, never double-counting a user who holds more than one', async () => {
    const dualId = (
      await users.create({
        name: 'dual@example.com',
        email: 'dual@example.com',
        passwordHash: await hash('x'),
        roleIds: [3, 6],
      })
    ).id;
    const result = await service.publish(adminId, {
      title: 'Multi-role update',
      body: 'For players and umpires.',
      targetRoles: ['player', 'umpire'],
    });
    expect(result.recipients).toBe(3);
    expect(notificationRepo.forUser(dualId)).toHaveLength(1);
    expect(notificationRepo.forUser(playerId)).toHaveLength(1);
    expect(notificationRepo.forUser(umpireId)).toHaveLength(1);
    expect(notificationRepo.forUser(adminId)).toHaveLength(0);
  });
});
