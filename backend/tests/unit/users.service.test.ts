import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import { UsersService } from '../../src/modules/users-auth/users.service';
import {
  FakeAdminVerificationSender,
  FakeAudit,
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

describe('AuthzService', () => {
  let users: FakeUserRepo;
  let authz: AuthzService;

  beforeEach(() => {
    users = new FakeUserRepo();
    authz = new AuthzService(users);
  });

  it('passes when the user holds one of the allowed roles', async () => {
    const u = await seedUser(users, 'multi@example.com', [3, 6]);
    await expect(authz.assertRole(u.id, 'umpire', 'organizer')).resolves.toContain('umpire');
  });

  it('throws NOT_ALLOWED when the user lacks every allowed role', async () => {
    const u = await seedUser(users, 'player@example.com', [3]);
    await expect(authz.assertRole(u.id, 'platform_admin')).rejects.toMatchObject({
      status: 403,
      code: 'NOT_ALLOWED',
    });
  });

  it('reads roles fresh — a role granted a moment ago passes the very next check', async () => {
    const u = await seedUser(users, 'fresh@example.com', [3]);
    await expect(authz.assertRole(u.id, 'organizer')).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
    await users.addRole(u.id, 2);
    await expect(authz.assertRole(u.id, 'organizer')).resolves.toContain('organizer');
  });
});

describe('UsersService — admin role management', () => {
  let users: FakeUserRepo;
  let audit: FakeAudit;
  let auth: FakeAdminVerificationSender;
  let storage: FakeStorageAdapter;
  let notificationRepo: FakeNotificationRepo;
  let service: UsersService;
  let adminId: string;
  let playerId: string;

  beforeEach(async () => {
    users = new FakeUserRepo();
    audit = new FakeAudit();
    auth = new FakeAdminVerificationSender();
    storage = new FakeStorageAdapter();
    notificationRepo = new FakeNotificationRepo();
    service = new UsersService({
      users,
      authz: new AuthzService(users),
      audit,
      tx: fakeTx,
      auth,
      storage,
      notifications: new NotificationService({
        notifications: notificationRepo,
        users,
        email: new MailboxAdapter(),
      }),
    });
    adminId = (await seedUser(users, 'admin@example.com', [1])).id;
    playerId = (await seedUser(users, 'player@example.com', [3])).id;
  });

  it('me returns the current user with fresh roles', async () => {
    const me = await service.me(playerId);
    expect(me.email).toBe('player@example.com');
    expect(me.roles).toEqual(['player']);
  });

  it('becomeParent is self-directed — no admin actor, additive, idempotent', async () => {
    const roles = await service.becomeParent(playerId, '1.2.3.4');
    expect(roles.sort()).toEqual(['parent', 'player']);
    const entries = audit.actionsOf('role.self_granted');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: playerId,
      entityId: playerId,
      meta: { role: 'parent' },
      ip: '1.2.3.4',
    });

    const again = await service.becomeParent(playerId);
    expect(again.sort()).toEqual(['parent', 'player']);
  });

  it('becomePlayer is self-directed — mirrors becomeParent for a parent-only account', async () => {
    const parentOnlyId = (await seedUser(users, 'parentonly@example.com', [7])).id;
    const roles = await service.becomePlayer(parentOnlyId, '1.2.3.4');
    expect(roles.sort()).toEqual(['parent', 'player']);
    const entries = audit.actionsOf('role.self_granted');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: parentOnlyId,
      entityId: parentOnlyId,
      meta: { role: 'player' },
      ip: '1.2.3.4',
    });

    const again = await service.becomePlayer(parentOnlyId);
    expect(again.sort()).toEqual(['parent', 'player']);
  });

  it('listUsers requires platform_admin (server-side 403, not a hidden button)', async () => {
    await expect(service.listUsers(playerId)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    const list = await service.listUsers(adminId);
    expect(list.map((u) => u.email)).toContain('player@example.com');
  });

  it('grantRole adds the role, audits it, notifies the user, and it is visible on the target user immediately', async () => {
    const roles = await service.grantRole(adminId, playerId, 'organizer');
    expect(roles.sort()).toEqual(['organizer', 'player']);
    expect(audit.actionsOf('role.granted')).toHaveLength(1);
    expect(audit.actionsOf('role.granted')[0]!.meta).toEqual({ role: 'organizer' });

    const me = await service.me(playerId);
    expect(me.roles).toContain('organizer');

    const notifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === playerId && n.type === 'role_granted',
    );
    expect(notifs).toHaveLength(1);
    expect(notifs[0]!.body).toContain('Organizer');
  });

  it('revokeRole removes the role, audits it, and notifies the user', async () => {
    await service.grantRole(adminId, playerId, 'organizer');
    const roles = await service.revokeRole(adminId, playerId, 'organizer');
    expect(roles).toEqual(['player']);
    expect(audit.actionsOf('role.revoked')).toHaveLength(1);

    const notifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === playerId && n.type === 'role_revoked',
    );
    expect(notifs).toHaveLength(1);
  });

  it('an admin cannot revoke their own platform_admin role, even with other admins around', async () => {
    await seedUser(users, 'second-admin@example.com', [1]);
    await expect(service.revokeRole(adminId, adminId, 'platform_admin')).rejects.toMatchObject({
      code: 'CANNOT_REVOKE_OWN_ADMIN',
    });
  });

  it('one admin CAN revoke platform_admin from a different admin', async () => {
    const secondAdmin = await seedUser(users, 'second-admin@example.com', [1]);
    const roles = await service.revokeRole(adminId, secondAdmin.id, 'platform_admin');
    expect(roles).not.toContain('platform_admin');
  });

  it('grantRole recomputes the club id prefix from the new higher-priority role, keeping the same number', async () => {
    await users.setClubId(playerId, 'P-123456');
    await service.grantRole(adminId, playerId, 'organizer');
    const updated = await users.findById(playerId);
    expect(updated?.clubId).toBe('O-123456');
  });

  it('revokeRole reverts the club id prefix once the higher-priority role is gone, keeping the same number', async () => {
    await users.setClubId(playerId, 'P-123456');
    await service.grantRole(adminId, playerId, 'organizer');
    await service.revokeRole(adminId, playerId, 'organizer');
    const updated = await users.findById(playerId);
    expect(updated?.clubId).toBe('P-123456');
  });

  it('platform_admin never gets a club id — revoking down to admin-only clears it', async () => {
    const dualId = (await seedUser(users, 'dualrole@example.com', [1, 3])).id;
    await users.setClubId(dualId, 'P-555555');
    await service.revokeRole(adminId, dualId, 'player');
    const updated = await users.findById(dualId);
    expect(updated?.clubId).toBeNull();
  });

  it('non-admins cannot grant roles — not even to themselves', async () => {
    await expect(service.grantRole(playerId, playerId, 'platform_admin')).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
  });

  it('an admin cannot grant platform_admin to anyone, even themselves', async () => {
    await expect(service.grantRole(adminId, playerId, 'platform_admin')).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_NOT_GRANTABLE',
    });
    await expect(service.grantRole(adminId, adminId, 'platform_admin')).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_NOT_GRANTABLE',
    });
    const roles = await service.me(playerId);
    expect(roles.roles).not.toContain('platform_admin');
  });

  it('granting a role to a missing user is a 404', async () => {
    await expect(service.grantRole(adminId, 'ghost', 'player')).rejects.toMatchObject({
      status: 404,
    });
  });

  it("getProfile returns the user's own editable fields", async () => {
    const profile = await service.getProfile(playerId);
    expect(profile).toMatchObject({ email: 'player@example.com', dateOfBirth: null });
  });

  it('updateProfile changes name + date of birth, reflected immediately in /me', async () => {
    const updated = await service.updateProfile(playerId, {
      name: 'Renamed Player',
      dateOfBirth: '2001-05-20',
    });
    expect(updated).toMatchObject({ name: 'Renamed Player', dateOfBirth: '2001-05-20' });
    const me = await service.me(playerId);
    expect(me.name).toBe('Renamed Player');
  });

  it('updateProfile can clear the date of birth with an empty string', async () => {
    await service.updateProfile(playerId, { name: 'P', dateOfBirth: '2001-05-20' });
    const cleared = await service.updateProfile(playerId, { name: 'P', dateOfBirth: '' });
    expect(cleared.dateOfBirth).toBeNull();
  });

  it('updateProfile sets and clears state — used for organizer publish-notify targeting', async () => {
    const withState = await service.updateProfile(playerId, { name: 'P', state: 'Texas' });
    expect(withState.state).toBe('Texas');
    const cleared = await service.updateProfile(playerId, { name: 'P', state: '' });
    expect(cleared.state).toBeNull();
  });

  it("updateNotifyPublishStates sets the caller's own opt-in list, independent of their home `state`", async () => {
    const updated = await service.updateNotifyPublishStates(playerId, ['Texas', 'California']);
    expect(updated.notifyPublishStates).toEqual(['Texas', 'California']);
    const me = await service.getProfile(playerId);
    expect(me.notifyPublishStates).toEqual(['Texas', 'California']);
    expect(me.state).toBeNull();

    const cleared = await service.updateNotifyPublishStates(playerId, []);
    expect(cleared.notifyPublishStates).toEqual([]);
  });

  it('requestVerification requires platform_admin (server-side 403, not a hidden button)', async () => {
    await expect(service.requestVerification(playerId, playerId)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
  });

  it('requestVerification sends a fresh verification email and audits it', async () => {
    await service.requestVerification(adminId, playerId, '127.0.0.1');
    expect(auth.calls).toEqual([playerId]);
    expect(audit.actionsOf('user.verification_requested')).toHaveLength(1);
    expect(audit.actionsOf('user.verification_requested')[0]!.actorUserId).toBe(adminId);
  });

  it('requestVerification on an already-verified account is a clear conflict, not silence', async () => {
    auth.verifiedUserIds.add(playerId);
    await expect(service.requestVerification(adminId, playerId)).rejects.toMatchObject({
      code: 'ALREADY_VERIFIED',
    });
  });
});

describe('UsersService — sports profile', () => {
  let users: FakeUserRepo;
  let audit: FakeAudit;
  let service: UsersService;
  let playerId: string;
  let teammateId: string;

  const baseInput = {
    phone: '5551234',
    school: 'Riverside High',
    jerseyNumber: 7,
    jerseyName: 'ROCKET',
    jerseySize: 'l' as const,
    battingStyle: 'right_handed' as const,
    battingStyleOther: null,
    bowlingStyle: 'right_arm_fast' as const,
    bowlingStyleOther: null,
    playingRole: 'all_rounder' as const,
    emergencyContactName: 'Jane Doe',
    emergencyContactPhone: '555-9999',
    gender: 'male' as const,
    consentAccepted: true as const,
  };

  beforeEach(async () => {
    users = new FakeUserRepo();
    audit = new FakeAudit();
    service = new UsersService({
      users,
      authz: new AuthzService(users),
      audit,
      tx: fakeTx,
      auth: new FakeAdminVerificationSender(),
      storage: new FakeStorageAdapter(),
      notifications: new NotificationService({
        notifications: new FakeNotificationRepo(),
        users,
        email: new MailboxAdapter(),
      }),
    });
    playerId = (await seedUser(users, 'p1@example.com', [3])).id;
    teammateId = (await seedUser(users, 'p2@example.com', [3])).id;
  });

  it('writes every field, self-signs consent, and is NOT audited (self-directed)', async () => {
    const profile = await service.updateSportsProfile(playerId, baseInput);
    expect(profile).toMatchObject({
      phone: '5551234',
      school: 'Riverside High',
      jerseyNumber: 7,
      jerseyName: 'ROCKET',
      jerseySize: 'l',
      battingStyle: 'right_handed',
      bowlingStyle: 'right_arm_fast',
      playingRole: 'all_rounder',
      emergencyContactName: 'Jane Doe',
      emergencyContactPhone: '555-9999',
      consentConfirmed: true,
    });
    expect(profile.consentDate).not.toBeNull();
    const stored = await users.findById(playerId);
    expect(stored?.consentedByUserId).toBe(playerId);
    expect(audit.entries).toHaveLength(0);
  });

  it('rejects a jersey number already held by an accepted teammate on a shared team', async () => {
    const teammate = await users.findById(teammateId);
    teammate!.jerseyNumber = 9;
    users.teamRosterForJerseyCheck.push(
      { teamId: 'team-1', teamName: 'Thunder XI', userId: playerId, status: 'accepted' },
      { teamId: 'team-1', teamName: 'Thunder XI', userId: teammateId, status: 'accepted' },
    );
    await expect(
      service.updateSportsProfile(playerId, { ...baseInput, jerseyNumber: 9 }),
    ).rejects.toMatchObject({ code: 'JERSEY_NUMBER_TAKEN' });
  });

  it('allows the same jersey number when the two players are not teammates', async () => {
    const teammate = await users.findById(teammateId);
    teammate!.jerseyNumber = 9;
    const profile = await service.updateSportsProfile(playerId, { ...baseInput, jerseyNumber: 9 });
    expect(profile.jerseyNumber).toBe(9);
  });

  it('keeping your own existing jersey number is never a self-collision', async () => {
    await service.updateSportsProfile(playerId, { ...baseInput, jerseyNumber: 7 });
    users.teamRosterForJerseyCheck.push({
      teamId: 'team-1',
      teamName: 'Thunder XI',
      userId: playerId,
      status: 'accepted',
    });
    const profile = await service.updateSportsProfile(playerId, { ...baseInput, jerseyNumber: 7 });
    expect(profile.jerseyNumber).toBe(7);
  });
});
