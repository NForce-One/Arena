import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import { RoleRequestService } from '../../src/modules/users-auth/roleRequest.service';
import { UsersService } from '../../src/modules/users-auth/users.service';
import {
  FakeAdminVerificationSender,
  FakeAudit,
  FakeNotificationRepo,
  FakeRoleRequestRepo,
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

describe('RoleRequestService', () => {
  let users: FakeUserRepo;
  let roleRequests: FakeRoleRequestRepo;
  let audit: FakeAudit;
  let notificationRepo: FakeNotificationRepo;
  let usersService: UsersService;
  let service: RoleRequestService;
  let adminId: string;
  let playerId: string;

  beforeEach(async () => {
    users = new FakeUserRepo();
    roleRequests = new FakeRoleRequestRepo(users);
    audit = new FakeAudit();
    notificationRepo = new FakeNotificationRepo();
    const authz = new AuthzService(users);
    const notifications = new NotificationService({
      notifications: notificationRepo,
      users,
      email: new MailboxAdapter(),
    });
    usersService = new UsersService({
      users,
      authz,
      audit,
      tx: fakeTx,
      auth: new FakeAdminVerificationSender(),
      storage: new FakeStorageAdapter(),
      notifications,
    });
    service = new RoleRequestService({
      roleRequests,
      users: usersService,
      authz,
      notifications,
      audit,
      tx: fakeTx,
    });

    adminId = (await seedUser(users, 'admin@example.com', [1])).id;
    playerId = (await seedUser(users, 'player@example.com', [3])).id;
  });

  it('approve grants the role, revokes the default player role, and notifies the requester', async () => {
    const req = await roleRequests.create(playerId, 'ground_owner');
    await service.approve(adminId, req.id);

    expect(await users.getRoleNames(playerId)).toEqual(['ground_owner']);
    expect(audit.actionsOf('role.granted')).toHaveLength(1);
    expect(audit.actionsOf('role.granted')[0]!.meta).toEqual({ role: 'ground_owner' });
    expect(audit.actionsOf('role.revoked')).toHaveLength(1);
    expect(audit.actionsOf('role.revoked')[0]!.meta).toMatchObject({ role: 'player' });

    const notes = [...notificationRepo.rows.values()].filter((n) => n.userId === playerId);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.type).toBe('role_request_approved');
  });

  it('deny does NOT grant the role, writes role_request.denied, and notifies the requester', async () => {
    const req = await roleRequests.create(playerId, 'umpire');
    await service.deny(adminId, req.id);

    expect(await users.getRoleNames(playerId)).not.toContain('umpire');
    expect(audit.actionsOf('role_request.denied')).toHaveLength(1);
    expect(audit.actionsOf('role_request.denied')[0]!.meta).toMatchObject({
      role: 'umpire',
      targetUserId: playerId,
    });

    const notes = [...notificationRepo.rows.values()].filter((n) => n.userId === playerId);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.type).toBe('role_request_denied');
  });

  it('a non-admin cannot approve, deny, or list requests', async () => {
    const req = await roleRequests.create(playerId, 'organizer');
    await expect(service.approve(playerId, req.id)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(service.deny(playerId, req.id)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(service.listPending(playerId)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('approving or denying an already-decided request is a conflict', async () => {
    const req = await roleRequests.create(playerId, 'organizer');
    await service.approve(adminId, req.id);
    await expect(service.approve(adminId, req.id)).rejects.toMatchObject({
      code: 'ALREADY_DECIDED',
    });
    await expect(service.deny(adminId, req.id)).rejects.toMatchObject({ code: 'ALREADY_DECIDED' });
  });

  it('race: two admins approving the same request — only the winner grants and notifies', async () => {
    const req = await roleRequests.create(playerId, 'team_manager');
    const second = (await seedUser(users, 'second-admin@example.com', [1])).id;

    const [first, race] = await Promise.allSettled([
      service.approve(adminId, req.id),
      service.approve(second, req.id),
    ]);

    const outcomes = [first, race];
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((o) => o.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({ code: 'ALREADY_DECIDED' });

    expect(await users.getRoleNames(playerId)).toEqual(['team_manager']);
    expect(audit.actionsOf('role.granted')).toHaveLength(1);
    expect(audit.actionsOf('role.revoked')).toHaveLength(1);
    const notes = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === playerId && n.type === 'role_request_approved',
    );
    expect(notes).toHaveLength(1);
  });

  it('a second pending request for the same user is rejected; a fresh request after denial succeeds', async () => {
    const first = await roleRequests.create(playerId, 'organizer');
    await expect(roleRequests.create(playerId, 'umpire')).rejects.toMatchObject({
      code: 'ROLE_REQUEST_PENDING',
    });

    await service.deny(adminId, first.id);
    await expect(roleRequests.create(playerId, 'umpire')).resolves.toMatchObject({
      userId: playerId,
      requestedRole: 'umpire',
      status: 'pending',
    });
  });

  describe('requestRole (post-signup self-service)', () => {
    it('creates a pending request and notifies every admin, without auditing the submission', async () => {
      const secondAdminId = (await seedUser(users, 'second-admin@example.com', [1])).id;
      const request = await service.requestRole(playerId, 'organizer');

      expect(request).toMatchObject({
        userId: playerId,
        requestedRole: 'organizer',
        status: 'pending',
      });
      expect(await roleRequests.findPendingForUser(playerId)).toMatchObject({ id: request.id });

      expect(audit.entries.some((e) => e.action.startsWith('role_request'))).toBe(false);

      const notifiedAdminIds = [...notificationRepo.rows.values()]
        .filter((n) => n.type === 'role_request_submitted')
        .map((n) => n.userId)
        .sort();
      expect(notifiedAdminIds).toEqual([adminId, secondAdminId].sort());
    });

    it('rejects a role the user already holds', async () => {
      const organizerId = (await seedUser(users, 'org@example.com', [3, 2])).id;
      await expect(service.requestRole(organizerId, 'organizer')).rejects.toMatchObject({
        code: 'ALREADY_HAS_ROLE',
      });
    });

    it('rejects a second pending request while one is already pending', async () => {
      await service.requestRole(playerId, 'organizer');
      await expect(service.requestRole(playerId, 'umpire')).rejects.toMatchObject({
        code: 'ROLE_REQUEST_PENDING',
      });
    });
  });

  describe('listMine', () => {
    it("returns only the caller's own requests, newest first, no admin check needed", async () => {
      const otherId = (await seedUser(users, 'other@example.com', [3])).id;
      const first = await roleRequests.create(playerId, 'organizer');
      await service.deny(adminId, first.id);
      const second = await roleRequests.create(playerId, 'umpire');
      await roleRequests.create(otherId, 'ground_owner');

      const mine = await service.listMine(playerId);
      expect(mine.map((r) => r.id)).toEqual([second.id, first.id]);
      expect(mine.every((r) => r.userId === playerId)).toBe(true);
    });
  });
});
