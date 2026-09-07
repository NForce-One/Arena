import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { UmpireService } from '../../src/modules/fixtures/umpire.service';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import {
  FakeAudit,
  FakeFixtureRepo,
  FakeNotificationRepo,
  FakeOrganizerTournamentRepo,
  FakeUmpireAssignmentRepo,
  FakeUserRepo,
  MailboxAdapter,
  fakeTx,
} from '../helpers/fakes';

describe('UmpireService', () => {
  let users: FakeUserRepo;
  let fixtureRepo: FakeFixtureRepo;
  let assignmentRepo: FakeUmpireAssignmentRepo;
  let tournamentRepo: FakeOrganizerTournamentRepo;
  let notificationRepo: FakeNotificationRepo;
  let audit: FakeAudit;
  let service: UmpireService;
  let organizerId: string;
  let umpireId: string;
  let tournamentId: string;

  async function makeFixture(startsAtIso: string): Promise<string> {
    const f = await fixtureRepo.create({
      tournamentId,
      homeTeamId: 'team-a',
      awayTeamId: 'team-b',
      groundId: null,
      startsAt: new Date(startsAtIso),
      durationMinutes: 240,
    });
    return f.id;
  }

  beforeEach(async () => {
    users = new FakeUserRepo();
    fixtureRepo = new FakeFixtureRepo();
    assignmentRepo = new FakeUmpireAssignmentRepo(fixtureRepo, users);
    fixtureRepo.assignments = assignmentRepo;
    tournamentRepo = new FakeOrganizerTournamentRepo();
    notificationRepo = new FakeNotificationRepo();
    const notifications = new NotificationService({
      notifications: notificationRepo,
      users,
      email: new MailboxAdapter(),
    });
    audit = new FakeAudit();
    service = new UmpireService({
      fixtures: fixtureRepo,
      assignments: assignmentRepo,
      tournaments: tournamentRepo,
      users,
      notifications,
      authz: new AuthzService(users),
      audit,
      tx: fakeTx,
    });

    const mk = async (email: string, roleIds: number[], verified = true) => {
      const u = await users.create({ name: email, email, passwordHash: await hash('x'), roleIds });
      if (verified) await users.setVerified(u.id);
      return u.id;
    };
    organizerId = await mk('organizer@example.com', [2]);
    umpireId = await mk('umpire@example.com', [6]);

    const t = await tournamentRepo.create(organizerId, {
      name: 'Cup',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-30'),
      capacity: 8,
    });
    tournamentId = t.id;
    await tournamentRepo.updateStatus(tournamentId, 'published');
    fixtureRepo.tournaments.set(tournamentId, { name: 'Cup', status: 'published' });
  });

  it('an umpire can browse open fixtures and apply', async () => {
    const fixtureId = await makeFixture('2026-08-05T09:00:00Z');
    const open = await service.listOpen(umpireId);
    expect(open).toHaveLength(1);
    expect(open[0]!.myStatus).toBeNull();

    await service.apply(umpireId, fixtureId);
    const after = await service.listOpen(umpireId);
    expect(after[0]!.myStatus).toBe('applied');

    const applyNotifs = [...notificationRepo.rows.values()].filter(
      (n) => n.type === 'umpire_applied',
    );
    expect(applyNotifs).toHaveLength(1);
    expect(applyNotifs[0]!.payload).toMatchObject({ fixtureId, tournamentId });
  });

  it('lists open matches newest-arrival first, while the schedule stays time-ordered', async () => {
    const later = await makeFixture('2026-09-20T09:00:00Z');
    const earlier = await makeFixture('2026-08-05T09:00:00Z');

    const open = await service.listOpen(umpireId);
    expect(open.map((f) => f.id)).toEqual([earlier, later]);

    await service.assign(organizerId, later, umpireId);
    await service.assign(organizerId, earlier, umpireId);
    const schedule = await service.schedule(umpireId);
    expect(schedule.map((s) => s.fixtureId)).toEqual([earlier, later]);
  });

  it('an organizer assigns an umpire, which becomes accepted', async () => {
    const fixtureId = await makeFixture('2026-08-05T09:00:00Z');
    await service.apply(umpireId, fixtureId);
    await service.assign(organizerId, fixtureId, umpireId, '127.0.0.1');
    const schedule = await service.schedule(umpireId);
    expect(schedule).toHaveLength(1);
    expect(schedule[0]!.fixtureId).toBe(fixtureId);

    const entries = audit.actionsOf('umpire.assigned');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: organizerId,
      entityType: 'fixture',
      entityId: fixtureId,
      meta: { umpireId },
      ip: '127.0.0.1',
    });
  });

  it('refuses assigning an umpire to a match overlapping an accepted one', async () => {
    const f1 = await makeFixture('2026-08-05T09:00:00Z');
    const f2 = await makeFixture('2026-08-05T11:00:00Z');
    await service.assign(organizerId, f1, umpireId);
    await expect(service.assign(organizerId, f2, umpireId)).rejects.toMatchObject({
      code: 'UMPIRE_CONFLICT',
    });
  });

  it('allows a non-overlapping second assignment', async () => {
    const f1 = await makeFixture('2026-08-05T09:00:00Z');
    const f2 = await makeFixture('2026-08-05T14:00:00Z');
    await service.assign(organizerId, f1, umpireId);
    await service.assign(organizerId, f2, umpireId);
    expect(await service.schedule(umpireId)).toHaveLength(2);
  });

  it('umpire accepts an invitation (overlap-checked) and declines another, notifying the organizer both times', async () => {
    const f1 = await makeFixture('2026-08-05T09:00:00Z');
    await assignmentRepo.upsertStatus(f1, umpireId, 'invited');
    await service.respondToInvite(umpireId, f1, 'accept');
    expect(await service.schedule(umpireId)).toHaveLength(1);
    const acceptedNotifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === organizerId && n.type === 'umpire_accepted',
    );
    expect(acceptedNotifs).toHaveLength(1);
    expect(acceptedNotifs[0]!.payload).toMatchObject({ tournamentId });

    const f2 = await makeFixture('2026-08-06T09:00:00Z');
    await assignmentRepo.upsertStatus(f2, umpireId, 'invited');
    await service.respondToInvite(umpireId, f2, 'decline');
    expect(await service.schedule(umpireId)).toHaveLength(1);
    const declinedNotifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === organizerId && n.type === 'umpire_declined',
    );
    expect(declinedNotifs).toHaveLength(1);
    expect(declinedNotifs[0]!.payload).toMatchObject({ tournamentId });
  });

  it('refuses accepting an invitation that overlaps an accepted match', async () => {
    const f1 = await makeFixture('2026-08-05T09:00:00Z');
    await service.assign(organizerId, f1, umpireId);
    const f2 = await makeFixture('2026-08-05T10:00:00Z');
    await assignmentRepo.upsertStatus(f2, umpireId, 'invited');
    await expect(service.respondToInvite(umpireId, f2, 'accept')).rejects.toMatchObject({
      code: 'UMPIRE_CONFLICT',
    });
  });

  it('requires a verified email to apply', async () => {
    const unverified = (
      await users.create({ name: 'u2', email: 'u2@example.com', passwordHash: 'x', roleIds: [6] })
    ).id;
    const fixtureId = await makeFixture('2026-08-05T09:00:00Z');
    await expect(service.apply(unverified, fixtureId)).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
    });
  });

  describe('inviting an umpire to an already-scheduled fixture', () => {
    it('sends an invite the umpire must accept or decline, not a direct assignment', async () => {
      const fixtureId = await makeFixture('2026-08-05T09:00:00Z');
      await service.invite(organizerId, fixtureId, umpireId);
      const open = await service.listOpen(umpireId);
      expect(open[0]!.myStatus).toBe('invited');
      expect(await service.schedule(umpireId)).toHaveLength(0);

      await service.respondToInvite(umpireId, fixtureId, 'accept');
      expect(await service.schedule(umpireId)).toHaveLength(1);
    });

    it('lets the organizer invite a replacement after the first umpire declines', async () => {
      const fixtureId = await makeFixture('2026-08-05T09:00:00Z');
      const otherUmpireId = (
        await users.create({ name: 'u2', email: 'u2@example.com', passwordHash: 'x', roleIds: [6] })
      ).id;

      await service.invite(organizerId, fixtureId, umpireId);
      await service.respondToInvite(umpireId, fixtureId, 'decline');

      await service.invite(organizerId, fixtureId, otherUmpireId);
      const openForOther = await service.listOpen(otherUmpireId);
      expect(openForOther[0]!.myStatus).toBe('invited');
      const openForFirst = await service.listOpen(umpireId);
      expect(openForFirst[0]!.myStatus).toBe('declined');
    });

    it('refuses inviting to a fixture in a tournament the organizer does not own', async () => {
      const otherOrganizerId = (
        await users.create({ name: 'o2', email: 'o2@example.com', passwordHash: 'x', roleIds: [2] })
      ).id;
      const fixtureId = await makeFixture('2026-08-05T09:00:00Z');
      await expect(service.invite(otherOrganizerId, fixtureId, umpireId)).rejects.toMatchObject({
        code: 'NOT_ALLOWED',
      });
    });

    it('refuses re-inviting an umpire who already accepted', async () => {
      const fixtureId = await makeFixture('2026-08-05T09:00:00Z');
      await service.assign(organizerId, fixtureId, umpireId);
      await expect(service.invite(organizerId, fixtureId, umpireId)).rejects.toMatchObject({
        code: 'ALREADY_ASSIGNED',
      });
    });
  });

  describe('umpire directory (organizer picks instead of typing emails)', () => {
    it('lists every umpire, flagging unverified ones, and no non-umpires', async () => {
      await users.create({
        name: 'Zoe Unverified',
        email: 'zoe@example.com',
        passwordHash: 'x',
        roleIds: [6],
      });
      const directory = await service.listDirectory(organizerId);
      expect(directory.map((u) => u.email)).toContain('zoe@example.com');
      expect(directory.find((u) => u.email === 'zoe@example.com')!.verified).toBe(false);
      expect(directory.some((u) => u.email === 'organizer@example.com')).toBe(false);
    });

    it('is not readable by a non-organizer', async () => {
      await expect(service.listDirectory(umpireId)).rejects.toMatchObject({
        code: 'NOT_ALLOWED',
      });
    });
  });
});
