import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { FakeNotificationRepo, FakeUserRepo, MailboxAdapter } from '../helpers/fakes';

describe('NotificationService', () => {
  let users: FakeUserRepo;
  let repo: FakeNotificationRepo;
  let mailbox: MailboxAdapter;
  let service: NotificationService;
  let userId: string;

  beforeEach(async () => {
    users = new FakeUserRepo();
    repo = new FakeNotificationRepo();
    mailbox = new MailboxAdapter();
    service = new NotificationService({ notifications: repo, users, email: mailbox });
    userId = (
      await users.create({
        name: 'Pat',
        email: 'pat@example.com',
        passwordHash: await hash('x'),
        roleIds: [3],
      })
    ).id;
  });

  it('writes the in-app notification and sends the email (status: sent)', async () => {
    await service.notify({ userId, type: 'test', title: 'Hello', body: 'World' });
    const rows = repo.forUser(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.emailStatus).toBe('sent');
    expect(mailbox.notifications).toHaveLength(1);
    expect(mailbox.notifications[0]!.to).toBe('pat@example.com');
  });

  it('a FAILED email never removes the in-app notification and never throws', async () => {
    mailbox.failNext = true;
    await expect(
      service.notify({ userId, type: 'test', title: 'Hello', body: 'World' }),
    ).resolves.toBeUndefined();
    const rows = repo.forUser(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.emailStatus).toBe('failed');
    expect(mailbox.notifications).toHaveLength(0);
  });

  it('records a provider REJECTION as failed, not sent', async () => {
    mailbox.rejectNext = true;
    await expect(
      service.notify({ userId, type: 'test', title: 'Hello', body: 'World' }),
    ).resolves.toBeUndefined();
    const rows = repo.forUser(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.emailStatus).toBe('failed');
    expect(mailbox.notifications).toHaveLength(0);
  });

  it('lists notifications with an unread count; markRead flips it', async () => {
    await service.notify({ userId, type: 'a', title: 'One', body: '1' });
    await service.notify({ userId, type: 'b', title: 'Two', body: '2' });

    let feed = await service.listFor(userId);
    expect(feed.notifications).toHaveLength(2);
    expect(feed.unread).toBe(2);

    await service.markRead(userId, feed.notifications[0]!.id);
    feed = await service.listFor(userId);
    expect(feed.unread).toBe(1);

    await service.markAllRead(userId);
    feed = await service.listFor(userId);
    expect(feed.unread).toBe(0);
  });

  describe('notifyMany', () => {
    it('a broadcast lands as ONE notification for a parent even when several children match the audience', async () => {
      const parent = await users.create({
        name: 'Parent',
        email: 'parent@example.com',
        passwordHash: await hash('x'),
        roleIds: [3],
      });
      const child1 = await users.create({
        name: 'Kid One',
        email: 'kid1@example.com',
        passwordHash: await hash('x'),
        roleIds: [3],
        managedByParentId: parent.id,
      });
      const child2 = await users.create({
        name: 'Kid Two',
        email: 'kid2@example.com',
        passwordHash: await hash('x'),
        roleIds: [3],
        managedByParentId: parent.id,
      });

      const count = await service.notifyMany([child1.id, child2.id, userId], {
        type: 'announcement',
        title: 'Season update',
        body: 'New rules for this season.',
      });

      expect(count).toBe(2);
      expect(repo.forUser(parent.id)).toHaveLength(1);
      expect(repo.forUser(userId)).toHaveLength(1);
      expect(mailbox.notifications).toHaveLength(2);
    });
  });

  it("markRead on someone else's notification is a 404", async () => {
    await service.notify({ userId, type: 'a', title: 'One', body: '1' });
    const other = await users.create({
      name: 'Eve',
      email: 'eve@example.com',
      passwordHash: await hash('x'),
      roleIds: [3],
    });
    const feed = await service.listFor(userId);
    await expect(service.markRead(other.id, feed.notifications[0]!.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('markUnread reverses a single markRead, restoring the unread count', async () => {
    await service.notify({ userId, type: 'a', title: 'One', body: '1' });
    let feed = await service.listFor(userId);
    const id = feed.notifications[0]!.id;

    await service.markRead(userId, id);
    feed = await service.listFor(userId);
    expect(feed.unread).toBe(0);
    expect(feed.notifications[0]!.readAt).not.toBeNull();

    await service.markUnread(userId, id);
    feed = await service.listFor(userId);
    expect(feed.unread).toBe(1);
    expect(feed.notifications[0]!.readAt).toBeNull();
  });

  it('markUnread recovers from an accidental "Mark all read"', async () => {
    await service.notify({ userId, type: 'a', title: 'One', body: '1' });
    await service.notify({ userId, type: 'b', title: 'Two', body: '2' });
    await service.markAllRead(userId);
    let feed = await service.listFor(userId);
    expect(feed.unread).toBe(0);

    await service.markUnread(userId, feed.notifications[0]!.id);
    feed = await service.listFor(userId);
    expect(feed.unread).toBe(1);
  });

  it('markUnread is idempotent on an already-unread notification', async () => {
    await service.notify({ userId, type: 'a', title: 'One', body: '1' });
    const feed = await service.listFor(userId);
    await expect(service.markUnread(userId, feed.notifications[0]!.id)).resolves.toBeUndefined();
  });

  it("markUnread on someone else's notification is a 404", async () => {
    await service.notify({ userId, type: 'a', title: 'One', body: '1' });
    const other = await users.create({
      name: 'Eve',
      email: 'eve2@example.com',
      passwordHash: await hash('x'),
      roleIds: [3],
    });
    const feed = await service.listFor(userId);
    await service.markRead(userId, feed.notifications[0]!.id);
    await expect(service.markUnread(other.id, feed.notifications[0]!.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('markUnread on an unknown id is a 404', async () => {
    await expect(service.markUnread(userId, 'not-a-real-id')).rejects.toMatchObject({
      status: 404,
    });
  });
});
