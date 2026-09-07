import { hash } from '@node-rs/argon2';
import type { TournamentNotifyAudience } from '@nforce/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { OrganizerTournamentService } from '../../src/modules/tournaments/organizerTournament.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import {
  FakeAudit,
  FakeNotificationRepo,
  FakeOrganizerTournamentRepo,
  FakeRegistrationRepo,
  FakeStorageAdapter,
  FakeTeamRepo,
  FakeUserRepo,
  MailboxAdapter,
  fakeTx,
} from '../helpers/fakes';

describe('OrganizerTournamentService', () => {
  let repo: FakeOrganizerTournamentRepo;
  let audit: FakeAudit;
  let notificationRepo: FakeNotificationRepo;
  let users: FakeUserRepo;
  let service: OrganizerTournamentService;
  let organizerId: string;
  let otherOrganizerId: string;
  let adminId: string;
  let playerId: string;
  let registrationRepo: FakeRegistrationRepo;
  let teamRepo: FakeTeamRepo;
  let mkManager: (email: string) => Promise<string>;

  const input = {
    name: 'Spring Cup',
    structure: 'round_robin' as const,
    teamSelectionMode: 'prebuilt_rosters' as const,
    notifyOnPublish: false,
    notifyAudiences: ['everyone'] as TournamentNotifyAudience[],
    startDate: '2026-08-01',
    endDate: '2026-08-10',
    capacity: 8,
    locationCity: 'Dallas',
    locationState: 'Texas',
    ageGroups: [
      {
        ageGroupId: 'age-open',
        genderCategory: 'mixed' as const,
        registrationStartDate: '2026-07-01',
        registrationEndDate: '2026-07-25',
        format: 'T20',
      },
    ],
  };

  beforeEach(async () => {
    repo = new FakeOrganizerTournamentRepo();
    audit = new FakeAudit();
    notificationRepo = new FakeNotificationRepo();
    users = new FakeUserRepo();
    teamRepo = new FakeTeamRepo(users);
    registrationRepo = new FakeRegistrationRepo({ users, teams: teamRepo });
    service = new OrganizerTournamentService({
      tournaments: repo,
      authz: new AuthzService(users),
      audit,
      tx: fakeTx,
      notifications: new NotificationService({
        notifications: notificationRepo,
        users,
        email: new MailboxAdapter(),
      }),
      users,
      storage: new FakeStorageAdapter(),
      registrations: registrationRepo,
      teams: teamRepo,
    });

    const mk = async (email: string, roleIds: number[]) =>
      (await users.create({ name: email, email, passwordHash: await hash('x'), roleIds })).id;
    mkManager = (email: string) => mk(email, [4]);
    organizerId = await mk('organizer@example.com', [2]);
    otherOrganizerId = await mk('other@example.com', [2]);
    adminId = await mk('admin@example.com', [1]);
    playerId = await mk('player@example.com', [3]);
  });

  it('only an organizer can create a tournament, and it starts as draft', async () => {
    await expect(service.create(playerId, input)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    const created = await service.create(organizerId, input);
    expect(created.status).toBe('draft');
    expect(audit.actionsOf('tournament.created')).toHaveLength(1);
  });

  it('blocks a non-owner, non-admin organizer from editing', async () => {
    const created = await service.create(organizerId, input);
    await expect(
      service.update(otherOrganizerId, created.id, { name: 'Hijacked' }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('audits deleting a rules document', async () => {
    const created = await service.create(organizerId, input);
    await service.uploadRulesDocument(organizerId, created.id, {
      data: Buffer.from('rules').toString('base64'),
      contentType: 'application/pdf',
    });

    await service.deleteRulesDocument(organizerId, created.id);
    const entries = audit.actionsOf('tournament.rules_document_deleted');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: organizerId,
      entityType: 'tournament',
      entityId: created.id,
      meta: { name: 'Spring Cup' },
    });
  });

  it('lets a platform admin edit any organizer tournament', async () => {
    const created = await service.create(organizerId, input);
    const updated = await service.update(adminId, created.id, { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
  });

  it("rejects moving the end date earlier than an existing age group bracket's registration end date", async () => {
    const created = await service.create(organizerId, input);
    await expect(
      service.update(organizerId, created.id, { endDate: '2026-07-20' }),
    ).rejects.toMatchObject({ code: 'REGISTRATION_AFTER_END' });
  });

  it("allows moving the start date earlier than an existing bracket's registration end date — only the tournament END date bounds registration", async () => {
    const created = await service.create(organizerId, input);
    const updated = await service.update(organizerId, created.id, { startDate: '2026-07-20' });
    expect(updated.startDate).toBe('2026-07-20T00:00:00.000Z');
  });

  it('audits an edit with which fields were actually sent', async () => {
    const created = await service.create(organizerId, input);
    await service.update(organizerId, created.id, { name: 'Spring Cup 2', capacity: 12 });
    const entries = audit.actionsOf('tournament.updated');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: organizerId,
      entityType: 'tournament',
      entityId: created.id,
      meta: { name: 'Spring Cup 2', changedFields: ['name', 'capacity'] },
    });
  });

  it('rejects replacing the age groups with one whose registration end date is after the tournament end date', async () => {
    const created = await service.create(organizerId, input);
    await expect(
      service.update(organizerId, created.id, {
        ageGroups: [
          {
            ageGroupId: 'age-open',
            genderCategory: 'mixed',
            registrationStartDate: '2026-07-01',
            registrationEndDate: '2026-08-15',
            format: 'T20',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'REGISTRATION_AFTER_END' });
  });

  it('rejects editing once published', async () => {
    const created = await service.create(organizerId, input);
    await service.publish(organizerId, created.id);
    await expect(
      service.update(organizerId, created.id, { name: 'Too late' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATUS' });
  });

  it('rejects publishing an already-published or closed tournament', async () => {
    const created = await service.create(organizerId, input);
    await service.publish(organizerId, created.id);
    await expect(service.publish(organizerId, created.id)).rejects.toMatchObject({
      code: 'INVALID_STATUS',
    });
    await service.close(organizerId, created.id);
    await expect(service.publish(organizerId, created.id)).rejects.toMatchObject({
      code: 'INVALID_STATUS',
    });
  });

  it('rejects closing a draft tournament', async () => {
    const created = await service.create(organizerId, input);
    await expect(service.close(organizerId, created.id)).rejects.toMatchObject({
      code: 'INVALID_STATUS',
    });
  });

  it('deletes and audits; only owner or admin may delete', async () => {
    const created = await service.create(organizerId, input);
    await expect(service.delete(otherOrganizerId, created.id)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
    await service.delete(organizerId, created.id);
    expect(audit.actionsOf('tournament.deleted')).toHaveLength(1);
    await expect(service.getOwned(organizerId, created.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('notifies every actively-registered player/team when their tournament is deleted', async () => {
    const created = await service.create(organizerId, input);
    await registrationRepo.create(created.id, {
      userId: playerId,
      tournamentAgeGroupId: created.ageGroups[0]!.id,
    });
    await service.delete(organizerId, created.id);

    const playerNotifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === playerId && n.type === 'tournament_deleted',
    );
    expect(playerNotifs).toHaveLength(1);
    expect(playerNotifs[0]!.body).toContain(created.name);
  });

  describe('notifyOnPublish', () => {
    it('fires a notification to every player and team_manager on publish — never before', async () => {
      const managerId = (
        await users.create({
          name: 'manager@example.com',
          email: 'manager@example.com',
          passwordHash: await hash('x'),
          roleIds: [4],
        })
      ).id;
      const created = await service.create(organizerId, { ...input, notifyOnPublish: true });

      expect(
        [...notificationRepo.rows.values()].filter((n) => n.type === 'tournament_published'),
      ).toHaveLength(0);

      await service.publish(organizerId, created.id);

      const playerNotifs = [...notificationRepo.rows.values()].filter(
        (n) => n.userId === playerId && n.type === 'tournament_published',
      );
      const managerNotifs = [...notificationRepo.rows.values()].filter(
        (n) => n.userId === managerId && n.type === 'tournament_published',
      );
      expect(playerNotifs).toHaveLength(1);
      expect(playerNotifs[0]!.body).toContain('Spring Cup');
      expect(managerNotifs).toHaveLength(1);
      expect(
        [...notificationRepo.rows.values()].filter(
          (n) => n.userId === organizerId && n.type === 'tournament_published',
        ),
      ).toHaveLength(0);
    });

    it('does NOT notify team_managers for a draft_based tournament — they can never register a team on it', async () => {
      const managerId = (
        await users.create({
          name: 'manager2@example.com',
          email: 'manager2@example.com',
          passwordHash: await hash('x'),
          roleIds: [4],
        })
      ).id;
      const created = await service.create(organizerId, {
        ...input,
        teamSelectionMode: 'draft_based',
        notifyOnPublish: true,
      });
      await service.publish(organizerId, created.id);

      const playerNotifs = [...notificationRepo.rows.values()].filter(
        (n) => n.userId === playerId && n.type === 'tournament_published',
      );
      const managerNotifs = [...notificationRepo.rows.values()].filter(
        (n) => n.userId === managerId && n.type === 'tournament_published',
      );
      expect(playerNotifs).toHaveLength(1);
      expect(managerNotifs).toHaveLength(0);
    });

    it('sends nothing on publish when notifyOnPublish was never set', async () => {
      const created = await service.create(organizerId, input);
      await service.publish(organizerId, created.id);
      expect(
        [...notificationRepo.rows.values()].filter((n) => n.type === 'tournament_published'),
      ).toHaveLength(0);
    });
  });

  describe('notifyPublishStates subscription', () => {
    it("notifies a subscriber even when the organizer's own notifyOnPublish is off — this is the viewer's own opt-in, not the organizer's broadcast", async () => {
      await users.updateNotifyPublishStates(playerId, ['Texas']);
      const created = await service.create(organizerId, input);
      await service.publish(organizerId, created.id);
      expect(
        [...notificationRepo.rows.values()].filter(
          (n) => n.userId === playerId && n.type === 'tournament_published',
        ),
      ).toHaveLength(1);
    });

    it('never notifies a subscriber for a different state', async () => {
      await users.updateNotifyPublishStates(playerId, ['California']);
      const created = await service.create(organizerId, input);
      await service.publish(organizerId, created.id);
      expect(
        [...notificationRepo.rows.values()].filter(
          (n) => n.userId === playerId && n.type === 'tournament_published',
        ),
      ).toHaveLength(0);
    });

    it("excludes a subscribed team_manager for a draft_based tournament — same carve-out as the organizer's own broadcast, since a manager can't register a team there", async () => {
      const managerId = await mkManager('mgr-tx@example.com');
      await users.updateNotifyPublishStates(managerId, ['Texas']);
      const created = await service.create(organizerId, {
        ...input,
        teamSelectionMode: 'draft_based',
      });
      await service.publish(organizerId, created.id);
      expect(
        [...notificationRepo.rows.values()].filter(
          (n) => n.userId === managerId && n.type === 'tournament_published',
        ),
      ).toHaveLength(0);
    });

    it("dedupes a viewer who's both in the organizer's own broadcast AND separately subscribed — exactly one notification, not two", async () => {
      await users.updateNotifyPublishStates(playerId, ['Texas']);
      const created = await service.create(organizerId, { ...input, notifyOnPublish: true });
      await service.publish(organizerId, created.id);
      expect(
        [...notificationRepo.rows.values()].filter(
          (n) => n.userId === playerId && n.type === 'tournament_published',
        ),
      ).toHaveLength(1);
    });
  });

  describe('notifyAudience targeting', () => {
    it('"state" only reaches players/managers whose profile state matches', async () => {
      await users.updateProfile(playerId, {
        name: 'Player',
        dateOfBirth: null,
        academyName: null,
        state: 'Texas',
      });
      const managerInState = await mkManager('mgr-tx@example.com');
      await users.updateProfile(managerInState, {
        name: 'Manager TX',
        dateOfBirth: null,
        academyName: null,
        state: 'Texas',
      });
      const managerElsewhere = await mkManager('mgr-ca@example.com');
      await users.updateProfile(managerElsewhere, {
        name: 'Manager CA',
        dateOfBirth: null,
        academyName: null,
        state: 'California',
      });

      const created = await service.create(organizerId, {
        ...input,
        notifyOnPublish: true,
        notifyAudiences: ['state'],
        notifyState: 'Texas',
      });
      await service.publish(organizerId, created.id);

      const notified = new Set(
        [...notificationRepo.rows.values()]
          .filter((n) => n.type === 'tournament_published')
          .map((n) => n.userId),
      );
      expect(notified.has(playerId)).toBe(true);
      expect(notified.has(managerInState)).toBe(true);
      expect(notified.has(managerElsewhere)).toBe(false);
    });

    it('"last_year_players" reaches only individually-registered players from a tournament that started last year, platform-wide', async () => {
      const lastYearPlayerId = playerId;
      const thisYearPlayerId = (
        await users.create({
          name: 'this-year@example.com',
          email: 'this-year@example.com',
          passwordHash: await hash('x'),
          roleIds: [3],
        })
      ).id;
      const lastYear = new Date().getUTCFullYear() - 1;
      registrationRepo.tournamentInfo.set('other-tournament', {
        status: 'published',
        startDate: new Date(Date.UTC(lastYear, 5, 1)),
        teamSelectionMode: 'draft_based',
        ageGroups: [],
      });
      await registrationRepo.create('other-tournament', { userId: lastYearPlayerId });

      const created = await service.create(organizerId, {
        ...input,
        notifyOnPublish: true,
        notifyAudiences: ['last_year_players'],
      });
      await service.publish(organizerId, created.id);

      const notified = new Set(
        [...notificationRepo.rows.values()]
          .filter((n) => n.type === 'tournament_published')
          .map((n) => n.userId),
      );
      expect(notified.has(lastYearPlayerId)).toBe(true);
      expect(notified.has(thisYearPlayerId)).toBe(false);
    });

    it('"last_year_managers" reaches only managers whose team registered last year', async () => {
      const manager = await mkManager('mgr-last-year@example.com');
      const team = await teamRepo.create(manager, 'Last Year FC');
      const lastYear = new Date().getUTCFullYear() - 1;
      registrationRepo.tournamentInfo.set('other-tournament-2', {
        status: 'published',
        startDate: new Date(Date.UTC(lastYear, 5, 1)),
        teamSelectionMode: 'prebuilt_rosters',
        ageGroups: [],
      });
      await registrationRepo.create('other-tournament-2', { teamId: team.id });

      const created = await service.create(organizerId, {
        ...input,
        notifyOnPublish: true,
        notifyAudiences: ['last_year_managers'],
      });
      await service.publish(organizerId, created.id);

      const notified = new Set(
        [...notificationRepo.rows.values()]
          .filter((n) => n.type === 'tournament_published')
          .map((n) => n.userId),
      );
      expect(notified.has(manager)).toBe(true);
      expect(notified.has(playerId)).toBe(false);
    });
  });
});
