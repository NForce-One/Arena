import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import type { ParentService } from '../../src/modules/parents/parent.service';
import { PlayerProfileService } from '../../src/modules/players/playerProfile.service';
import { RegistrationService } from '../../src/modules/registrations/registration.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import {
  FakeAudit,
  FakeNotificationRepo,
  FakeOrganizerTournamentRepo,
  FakePlayerProfileRepo,
  FakeRegistrationRepo,
  FakeStorageAdapter,
  FakeTeamRepo,
  FakeUserRepo,
  MailboxAdapter,
  fakeTx,
  makeFakeParentService,
} from '../helpers/fakes';

describe('RegistrationService', () => {
  let users: FakeUserRepo;
  let teamRepo: FakeTeamRepo;
  let tournamentRepo: FakeOrganizerTournamentRepo;
  let registrationRepo: FakeRegistrationRepo;
  let notificationRepo: FakeNotificationRepo;
  let audit: FakeAudit;
  let service: RegistrationService;
  let parents: ParentService;
  let playerProfileRepo: FakePlayerProfileRepo;
  let organizerId: string;
  let playerId: string;
  let unverifiedPlayerId: string;
  let managerId: string;
  let parentId: string;
  let tournamentId: string;
  let tournamentAgeGroupId: string;

  const openTournament = {
    name: 'Open Cup',
    startDate: '2026-08-01',
    endDate: '2026-08-10',
    capacity: 2,
  };

  beforeEach(async () => {
    users = new FakeUserRepo();
    teamRepo = new FakeTeamRepo(users);
    tournamentRepo = new FakeOrganizerTournamentRepo();
    registrationRepo = new FakeRegistrationRepo({ users, teams: teamRepo });
    notificationRepo = new FakeNotificationRepo();
    const notifications = new NotificationService({
      notifications: notificationRepo,
      users,
      email: new MailboxAdapter(),
    });
    audit = new FakeAudit();
    parents = makeFakeParentService(users, audit);
    playerProfileRepo = new FakePlayerProfileRepo();
    const playerProfile = new PlayerProfileService({
      players: playerProfileRepo,
      storage: new FakeStorageAdapter(),
    });
    service = new RegistrationService({
      registrations: registrationRepo,
      users,
      teams: teamRepo,
      tournaments: tournamentRepo,
      notifications,
      authz: new AuthzService(users),
      audit,
      tx: fakeTx,
      playerProfile,
      parents,
    });

    const mk = async (email: string, roleIds: number[], verified = true) => {
      const u = await users.create({ name: email, email, passwordHash: await hash('x'), roleIds });
      if (verified) await users.setVerified(u.id);
      u.consentAcceptedAt = new Date();
      return u.id;
    };
    organizerId = await mk('organizer@example.com', [2]);
    playerId = await mk('player@example.com', [3]);
    unverifiedPlayerId = await mk('unverified@example.com', [3], false);
    managerId = await mk('manager@example.com', [4]);
    parentId = await mk('parent@example.com', [7]);

    const t = await tournamentRepo.create(organizerId, {
      name: openTournament.name,
      startDate: new Date(openTournament.startDate),
      endDate: new Date(openTournament.endDate),
      capacity: openTournament.capacity,
    });
    tournamentId = t.id;
    tournamentAgeGroupId = t.ageGroups[0]!.id;
    const DAY = 86_400_000;
    registrationRepo.tournamentInfo.set(tournamentId, {
      status: 'draft',
      startDate: new Date(openTournament.startDate),
      teamSelectionMode: 'prebuilt_rosters',
      ageGroups: [
        {
          id: tournamentAgeGroupId,
          bornAfter: null,
          bornBefore: null,
          genderCategory: 'mixed',
          registrationStartDate: new Date(Date.now() - 30 * DAY),
          registrationEndDate: new Date(Date.now() + 30 * DAY),
          capacity: openTournament.capacity,
        },
      ],
    });
  });

  function publish() {
    const info = registrationRepo.tournamentInfo.get(tournamentId)!;
    registrationRepo.tournamentInfo.set(tournamentId, { ...info, status: 'published' });
  }

  function yearsAgo(years: number): Date {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - years);
    return d;
  }

  function setAgeBounds(bornAfterYears: number | null, bornBeforeYears: number | null) {
    const info = registrationRepo.tournamentInfo.get(tournamentId)!;
    registrationRepo.tournamentInfo.set(tournamentId, {
      ...info,
      ageGroups: [
        {
          ...info.ageGroups[0]!,
          bornAfter: bornAfterYears != null ? yearsAgo(bornAfterYears) : null,
          bornBefore: bornBeforeYears != null ? yearsAgo(bornBeforeYears) : null,
        },
      ],
    });
  }

  function setGenderCategory(genderCategory: 'mens' | 'womens' | 'mixed') {
    const info = registrationRepo.tournamentInfo.get(tournamentId)!;
    registrationRepo.tournamentInfo.set(tournamentId, {
      ...info,
      ageGroups: [{ ...info.ageGroups[0]!, genderCategory }],
    });
  }

  async function stampConsent(userId: string) {
    const u = await users.findById(userId);
    if (u) u.consentAcceptedAt = new Date();
  }

  it('rejects an unverified player', async () => {
    publish();
    await expect(
      service.register(unverifiedPlayerId, tournamentId, { tournamentAgeGroupId }),
    ).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
    });
  });

  it('rejects registering for a tournament that is not published', async () => {
    await expect(
      service.register(playerId, tournamentId, { tournamentAgeGroupId }),
    ).rejects.toMatchObject({
      code: 'TOURNAMENT_NOT_PUBLISHED',
    });
  });

  it('registers a verified player once published, notifies them AND the organizer', async () => {
    publish();
    const reg = await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    expect(reg.status).toBe('active');
    expect(reg.entityType).toBe('player');

    const playerNotifs = [...notificationRepo.rows.values()].filter((n) => n.userId === playerId);
    expect(playerNotifs).toHaveLength(1);
    expect(playerNotifs[0]!.body).toContain('Open Cup');

    const organizerNotifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === organizerId && n.type === 'new_registration',
    );
    expect(organizerNotifs).toHaveLength(1);
    expect(organizerNotifs[0]!.body).toContain('Open Cup');
  });

  it('rejects a duplicate active registration for the same player', async () => {
    publish();
    await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    await expect(
      service.register(playerId, tournamentId, { tournamentAgeGroupId }),
    ).rejects.toMatchObject({
      code: 'ALREADY_REGISTERED',
    });
  });

  it('allows re-registering after withdrawing', async () => {
    publish();
    const reg = await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    await service.withdraw(playerId, reg.id);
    const again = await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    expect(again.status).toBe('active');
  });

  it('withdrawing writes an audit entry naming the entity and the tournament', async () => {
    publish();
    const reg = await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    await service.withdraw(playerId, reg.id, '127.0.0.1');
    const entries = audit.actionsOf('registration.withdrawn');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: playerId,
      entityType: 'user',
      entityId: playerId,
      meta: { tournamentId },
      ip: '127.0.0.1',
    });
  });

  it('withdrawing notifies the organizer', async () => {
    publish();
    const reg = await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    await service.withdraw(playerId, reg.id);

    const organizerNotifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === organizerId && n.type === 'registration_withdrawn',
    );
    expect(organizerNotifs).toHaveLength(1);
    expect(organizerNotifs[0]!.body).toContain('Open Cup');
    expect(organizerNotifs[0]!.payload).toMatchObject({ forRole: 'organizer' });
  });

  it('when the ORGANIZER withdraws a player, notifies the player instead of the organizer', async () => {
    publish();
    const reg = await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    notificationRepo.rows.clear();
    await service.withdraw(organizerId, reg.id);

    const playerNotifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === playerId && n.type === 'registration_withdrawn',
    );
    expect(playerNotifs).toHaveLength(1);
    expect(playerNotifs[0]!.payload).toMatchObject({ forRole: 'registrant' });
    const organizerSelfNotifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === organizerId,
    );
    expect(organizerSelfNotifs).toHaveLength(0);
  });

  it("when the ORGANIZER withdraws a team, notifies the team's manager", async () => {
    publish();
    const team = await teamRepo.create(managerId, 'Falcons');
    const reg = await service.register(managerId, tournamentId, {
      teamId: team.id,
      tournamentAgeGroupId,
    });
    notificationRepo.rows.clear();
    await service.withdraw(organizerId, reg.id);

    const managerNotifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === managerId && n.type === 'registration_withdrawn',
    );
    expect(managerNotifs).toHaveLength(1);
  });

  describe('registerChild (parent on behalf of a managed child)', () => {
    it('registers the child, notifies the PARENT (not the child), and audits it', async () => {
      publish();
      const child = await parents.addChild(parentId, { name: 'Kid', dateOfBirth: '2015-01-01' });
      await stampConsent(child.id);

      const reg = await service.registerChild(
        parentId,
        child.id,
        tournamentId,
        tournamentAgeGroupId,
        '127.0.0.1',
      );
      expect(reg.status).toBe('active');
      expect(reg.entityId).toBe(child.id);

      const parentNotifs = [...notificationRepo.rows.values()].filter(
        (n) => n.userId === parentId && n.type === 'registration_confirmed',
      );
      expect(parentNotifs).toHaveLength(1);
      expect(parentNotifs[0]!.body).toContain('Kid');
      expect([...notificationRepo.rows.values()].some((n) => n.userId === child.id)).toBe(false);

      const entries = audit.actionsOf('registration.created');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        actorUserId: parentId,
        entityType: 'user',
        entityId: child.id,
        meta: { tournamentId, onBehalfOf: child.id },
        ip: '127.0.0.1',
      });
    });

    it('rejects a parent registering a child they do not own', async () => {
      publish();
      const otherParentId = (
        await users.create({
          name: 'other',
          email: 'other-parent@example.com',
          passwordHash: 'x',
          roleIds: [7],
        })
      ).id;
      const child = await parents.addChild(parentId, { name: 'Kid', dateOfBirth: '2015-01-01' });
      await expect(
        service.registerChild(
          otherParentId,
          child.id,
          tournamentId,
          tournamentAgeGroupId,
          undefined,
        ),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    });

    it('rejects registering a child who no longer meets the age group', async () => {
      publish();
      setAgeBounds(13, null);
      const fifteenYearsAgo = new Date();
      fifteenYearsAgo.setUTCFullYear(fifteenYearsAgo.getUTCFullYear() - 15);
      const teen = await parents.addChild(parentId, {
        name: 'Teen',
        dateOfBirth: fifteenYearsAgo.toISOString().slice(0, 10),
      });
      await expect(
        service.registerChild(parentId, teen.id, tournamentId, tournamentAgeGroupId, undefined),
      ).rejects.toMatchObject({ code: 'AGE_GROUP_MISMATCH' });
    });

    it('CHILD_NO_LONGER_MINOR blocks registering a child who has aged out', async () => {
      publish();
      const grownUp = await parents.addChild(parentId, {
        name: 'Grown Up',
        dateOfBirth: '2000-01-01',
      });
      await expect(
        service.registerChild(parentId, grownUp.id, tournamentId, tournamentAgeGroupId, undefined),
      ).rejects.toMatchObject({ code: 'CHILD_NO_LONGER_MINOR' });
    });
  });

  describe('withdraw via the parent branch of assertCanManage', () => {
    it('lets the managing parent withdraw a minor child', async () => {
      publish();
      const child = await parents.addChild(parentId, { name: 'Kid', dateOfBirth: '2015-01-01' });
      await stampConsent(child.id);
      const reg = await service.registerChild(
        parentId,
        child.id,
        tournamentId,
        tournamentAgeGroupId,
        undefined,
      );
      await service.withdraw(parentId, reg.id);
      const again = await service.registerChild(
        parentId,
        child.id,
        tournamentId,
        tournamentAgeGroupId,
        undefined,
      );
      expect(again.status).toBe('active');
    });

    it('rejects withdrawal by anyone other than the managing parent', async () => {
      publish();
      const child = await parents.addChild(parentId, { name: 'Kid', dateOfBirth: '2015-01-01' });
      await stampConsent(child.id);
      const reg = await service.registerChild(
        parentId,
        child.id,
        tournamentId,
        tournamentAgeGroupId,
        undefined,
      );
      await expect(service.withdraw(playerId, reg.id)).rejects.toMatchObject({
        code: 'NOT_ALLOWED',
      });
    });

    it('blocks withdrawal once the child has aged out, but the registration stays visible', async () => {
      publish();
      const soonAdult = await parents.addChild(parentId, {
        name: 'Soon Adult',
        dateOfBirth: '2015-01-01',
      });
      await stampConsent(soonAdult.id);
      const reg = await service.registerChild(
        parentId,
        soonAdult.id,
        tournamentId,
        tournamentAgeGroupId,
        undefined,
      );
      await users.updateChild(soonAdult.id, {
        name: 'Soon Adult',
        dateOfBirth: new Date('2000-01-01'),
      });
      await expect(service.withdraw(parentId, reg.id)).rejects.toMatchObject({
        code: 'CHILD_NO_LONGER_MINOR',
      });
      const forOrganizer = await service.listFor(organizerId, tournamentId);
      expect(forOrganizer.some((r) => r.id === reg.id)).toBe(true);
    });
  });

  describe('findFamily', () => {
    it("lists every active registration across the parent's children, with tournament names", async () => {
      publish();
      const kid1 = await parents.addChild(parentId, { name: 'Kid One', dateOfBirth: '2015-01-01' });
      const kid2 = await parents.addChild(parentId, { name: 'Kid Two', dateOfBirth: '2016-01-01' });
      await stampConsent(kid1.id);
      await stampConsent(kid2.id);
      await service.registerChild(parentId, kid1.id, tournamentId, tournamentAgeGroupId, undefined);
      await service.registerChild(parentId, kid2.id, tournamentId, tournamentAgeGroupId, undefined);
      registrationRepo.tournamentNames.set(tournamentId, openTournament.name);

      const family = await service.findFamily(parentId);
      expect(family).toHaveLength(2);
      expect(family.map((r) => r.childName).sort()).toEqual(['Kid One', 'Kid Two']);
      expect(family.every((r) => r.tournamentName === openTournament.name)).toBe(true);
      expect(family.every((r) => r.status === 'active')).toBe(true);
    });

    it('returns an empty list for a parent with no children', async () => {
      expect(await service.findFamily(parentId)).toEqual([]);
    });

    it('rejects a non-parent', async () => {
      await expect(service.findFamily(playerId)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    });
  });

  it('enforces capacity for TEAM registrations in prebuilt_rosters mode, but never for solo players', async () => {
    publish();
    const manager2 = (
      await users.create({ name: 'm2', email: 'm2@example.com', passwordHash: 'x', roleIds: [4] })
    ).id;
    await users.setVerified(manager2);
    const manager3 = (
      await users.create({ name: 'm3', email: 'm3@example.com', passwordHash: 'x', roleIds: [4] })
    ).id;
    await users.setVerified(manager3);
    const team1 = await teamRepo.create(managerId, 'Team One');
    const team2 = await teamRepo.create(manager2, 'Team Two');
    const team3 = await teamRepo.create(manager3, 'Team Three');

    await service.register(managerId, tournamentId, { teamId: team1.id, tournamentAgeGroupId });
    await service.register(manager2, tournamentId, { teamId: team2.id, tournamentAgeGroupId });
    await expect(
      service.register(manager3, tournamentId, { teamId: team3.id, tournamentAgeGroupId }),
    ).rejects.toMatchObject({
      code: 'TOURNAMENT_FULL',
    });

    const p2 = (
      await users.create({ name: 'p2', email: 'p2@example.com', passwordHash: 'x', roleIds: [3] })
    ).id;
    await users.setVerified(p2);
    await stampConsent(p2);
    const p3 = (
      await users.create({ name: 'p3', email: 'p3@example.com', passwordHash: 'x', roleIds: [3] })
    ).id;
    await users.setVerified(p3);
    await stampConsent(p3);
    await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    await service.register(p2, tournamentId, { tournamentAgeGroupId });
    await service.register(p3, tournamentId, { tournamentAgeGroupId });
  });

  it('enforces capacity for PLAYER registrations in draft_based mode', async () => {
    publish();
    const info = registrationRepo.tournamentInfo.get(tournamentId)!;
    registrationRepo.tournamentInfo.set(tournamentId, {
      ...info,
      teamSelectionMode: 'draft_based',
    });
    const p2 = (
      await users.create({ name: 'p2', email: 'p2@example.com', passwordHash: 'x', roleIds: [3] })
    ).id;
    await users.setVerified(p2);
    await stampConsent(p2);
    const p3 = (
      await users.create({ name: 'p3', email: 'p3@example.com', passwordHash: 'x', roleIds: [3] })
    ).id;
    await users.setVerified(p3);
    await stampConsent(p3);

    await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    await service.register(p2, tournamentId, { tournamentAgeGroupId });
    await expect(
      service.register(p3, tournamentId, { tournamentAgeGroupId }),
    ).rejects.toMatchObject({
      code: 'TOURNAMENT_FULL',
    });
  });

  it('withdrawing a draft_based player also removes them from whichever draft team they were already assigned to', async () => {
    const draft = await tournamentRepo.create(organizerId, {
      name: 'Draft Cup',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-10'),
      capacity: null,
      teamSelectionMode: 'draft_based',
    });
    const draftTournamentId = draft.id;
    const draftAgeGroupId = draft.ageGroups[0]!.id;
    await tournamentRepo.updateStatus(draftTournamentId, 'published');
    registrationRepo.tournamentInfo.set(draftTournamentId, {
      status: 'published',
      startDate: draft.startDate,
      teamSelectionMode: 'draft_based',
      ageGroups: [
        {
          id: draftAgeGroupId,
          bornAfter: null,
          bornBefore: null,
          genderCategory: 'mixed',
          registrationStartDate: new Date(Date.now() - 86_400_000),
          registrationEndDate: new Date(Date.now() + 86_400_000),
          capacity: null,
        },
      ],
    });

    const reg = await service.register(playerId, draftTournamentId, {
      tournamentAgeGroupId: draftAgeGroupId,
    });

    const team = await teamRepo.createDraft(organizerId, 'Team A', draftAgeGroupId);
    await teamRepo.addAcceptedRosterEntry(team.id, playerId, 'player');
    expect((await teamRepo.findById(team.id))!.roster.map((r) => r.userId)).toEqual([playerId]);

    await service.withdraw(organizerId, reg.id);

    expect((await teamRepo.findById(team.id))!.roster).toEqual([]);
  });

  it('leaves a draft_based player on their team alone if a DIFFERENT registration in the same tournament is withdrawn', async () => {
    const draft = await tournamentRepo.create(organizerId, {
      name: 'Draft Cup 2',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-10'),
      capacity: null,
      teamSelectionMode: 'draft_based',
    });
    const draftTournamentId = draft.id;
    const draftAgeGroupId = draft.ageGroups[0]!.id;
    await tournamentRepo.updateStatus(draftTournamentId, 'published');
    registrationRepo.tournamentInfo.set(draftTournamentId, {
      status: 'published',
      startDate: draft.startDate,
      teamSelectionMode: 'draft_based',
      ageGroups: [
        {
          id: draftAgeGroupId,
          bornAfter: null,
          bornBefore: null,
          genderCategory: 'mixed',
          registrationStartDate: new Date(Date.now() - 86_400_000),
          registrationEndDate: new Date(Date.now() + 86_400_000),
          capacity: null,
        },
      ],
    });

    const p2 = (
      await users.create({
        name: 'p2',
        email: 'p2-draft@example.com',
        passwordHash: 'x',
        roleIds: [3],
      })
    ).id;
    await users.setVerified(p2);
    await stampConsent(p2);

    const reg1 = await service.register(playerId, draftTournamentId, {
      tournamentAgeGroupId: draftAgeGroupId,
    });
    await service.register(p2, draftTournamentId, { tournamentAgeGroupId: draftAgeGroupId });

    const team = await teamRepo.createDraft(organizerId, 'Team A', draftAgeGroupId);
    await teamRepo.addAcceptedRosterEntry(team.id, playerId, 'player');
    await teamRepo.addAcceptedRosterEntry(team.id, p2, 'player');

    await service.withdraw(organizerId, reg1.id);

    expect((await teamRepo.findById(team.id))!.roster.map((r) => r.userId)).toEqual([p2]);
  });

  function addSecondBracket(capacity: number | null): string {
    const secondBracketId = 'tag-second';
    const info = registrationRepo.tournamentInfo.get(tournamentId)!;
    registrationRepo.tournamentInfo.set(tournamentId, {
      ...info,
      ageGroups: [
        ...info.ageGroups,
        {
          id: secondBracketId,
          bornAfter: null,
          bornBefore: null,
          genderCategory: 'mixed',
          registrationStartDate: new Date(Date.now() - 86_400_000),
          registrationEndDate: new Date(Date.now() + 86_400_000),
          capacity,
        },
      ],
    });
    return secondBracketId;
  }

  it('lets a player register into a second bracket of the same tournament, independently of the first', async () => {
    publish();
    const secondBracketId = addSecondBracket(null);

    await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    await service.register(playerId, tournamentId, { tournamentAgeGroupId: secondBracketId });

    const mine = await service.findMine(playerId, tournamentId);
    expect(mine).toHaveLength(2);
    expect(new Set(mine.map((r) => r.tournamentAgeGroupId))).toEqual(
      new Set([tournamentAgeGroupId, secondBracketId]),
    );
  });

  it('still rejects a second registration into the SAME bracket', async () => {
    publish();
    await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    await expect(
      service.register(playerId, tournamentId, { tournamentAgeGroupId }),
    ).rejects.toMatchObject({ code: 'ALREADY_REGISTERED' });
  });

  it('per-bracket capacity is independent — a full bracket does not block a different, still-open bracket', async () => {
    publish();
    const secondBracketId = addSecondBracket(1);

    const manager2 = (
      await users.create({ name: 'm2', email: 'm2@example.com', passwordHash: 'x', roleIds: [4] })
    ).id;
    await users.setVerified(manager2);
    const team1 = await teamRepo.create(managerId, 'Team One');
    const team2 = await teamRepo.create(manager2, 'Team Two');

    await service.register(managerId, tournamentId, { teamId: team1.id, tournamentAgeGroupId });
    await service.register(manager2, tournamentId, { teamId: team2.id, tournamentAgeGroupId });

    const manager3 = (
      await users.create({ name: 'm3', email: 'm3@example.com', passwordHash: 'x', roleIds: [4] })
    ).id;
    await users.setVerified(manager3);
    const team3 = await teamRepo.create(manager3, 'Team Three');
    await service.register(manager3, tournamentId, {
      teamId: team3.id,
      tournamentAgeGroupId: secondBracketId,
    });
  });

  it('rejects age-ineligible registration and admits an eligible one', async () => {
    publish();
    setAgeBounds(15, 10);

    const tooOld = (
      await users.create({
        name: 'Old Player',
        email: 'old@example.com',
        passwordHash: 'x',
        roleIds: [3],
        dateOfBirth: new Date('1990-01-01'),
      })
    ).id;
    await users.setVerified(tooOld);
    await expect(
      service.register(tooOld, tournamentId, { tournamentAgeGroupId }),
    ).rejects.toMatchObject({
      code: 'AGE_GROUP_MISMATCH',
    });

    const eligible = (
      await users.create({
        name: 'Young Player',
        email: 'young@example.com',
        passwordHash: 'x',
        roleIds: [3],
        dateOfBirth: new Date('2015-01-01'),
      })
    ).id;
    await users.setVerified(eligible);
    await stampConsent(eligible);
    const reg = await service.register(eligible, tournamentId, { tournamentAgeGroupId });
    expect(reg.status).toBe('active');
  });

  it('treats a birth-cutoff month as fully inclusive, even when the stored cutoff date is not the 1st of the month', async () => {
    publish();
    const info = registrationRepo.tournamentInfo.get(tournamentId)!;
    registrationRepo.tournamentInfo.set(tournamentId, {
      ...info,
      ageGroups: [{ ...info.ageGroups[0]!, bornAfter: new Date('2007-10-05T00:00:00.000Z') }],
    });

    const bornEarlyInCutoffMonth = (
      await users.create({
        name: 'Early October',
        email: 'early-oct@example.com',
        passwordHash: 'x',
        roleIds: [3],
        dateOfBirth: new Date('2007-10-01'),
      })
    ).id;
    await users.setVerified(bornEarlyInCutoffMonth);
    await stampConsent(bornEarlyInCutoffMonth);
    const reg = await service.register(bornEarlyInCutoffMonth, tournamentId, {
      tournamentAgeGroupId,
    });
    expect(reg.status).toBe('active');

    const bornOneMonthTooOld = (
      await users.create({
        name: 'Late September',
        email: 'late-sep@example.com',
        passwordHash: 'x',
        roleIds: [3],
        dateOfBirth: new Date('2007-09-30'),
      })
    ).id;
    await users.setVerified(bornOneMonthTooOld);
    await expect(
      service.register(bornOneMonthTooOld, tournamentId, { tournamentAgeGroupId }),
    ).rejects.toMatchObject({ code: 'AGE_GROUP_MISMATCH' });
  });

  it('reports DOB_REQUIRED (not the generic age-mismatch) when the player has no date of birth on file for a bounded age group', async () => {
    publish();
    setAgeBounds(15, 10);
    await expect(
      service.register(playerId, tournamentId, { tournamentAgeGroupId }),
    ).rejects.toMatchObject({ code: 'DOB_REQUIRED' });
  });

  it('does not require a DOB for an "Open" (unbounded) age group', async () => {
    publish();
    const reg = await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    expect(reg.status).toBe('active');
  });

  it("rejects registration that doesn't meet the bracket's gender category", async () => {
    publish();
    setGenderCategory('womens');

    const man = (
      await users.create({
        name: 'Man',
        email: 'man@example.com',
        passwordHash: 'x',
        roleIds: [3],
      })
    ).id;
    await users.setVerified(man);
    await stampConsent(man);
    const u = await users.findById(man);
    u!.gender = 'male';
    await expect(
      service.register(man, tournamentId, { tournamentAgeGroupId }),
    ).rejects.toMatchObject({
      code: 'GENDER_CATEGORY_MISMATCH',
    });

    const woman = (
      await users.create({
        name: 'Woman',
        email: 'woman@example.com',
        passwordHash: 'x',
        roleIds: [3],
      })
    ).id;
    await users.setVerified(woman);
    await stampConsent(woman);
    const w = await users.findById(woman);
    w!.gender = 'female';
    const reg = await service.register(woman, tournamentId, { tournamentAgeGroupId });
    expect(reg.status).toBe('active');
  });

  it('gives a distinct GENDER_REQUIRED error (not GENDER_CATEGORY_MISMATCH) when the player has no gender set at all', async () => {
    publish();
    setGenderCategory('womens');
    await stampConsent(playerId);

    await expect(
      service.register(playerId, tournamentId, { tournamentAgeGroupId }),
    ).rejects.toMatchObject({
      code: 'GENDER_REQUIRED',
    });
  });

  it('never requires a gender on a mixed bracket, even with none set', async () => {
    publish();
    await stampConsent(playerId);

    const reg = await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    expect(reg.status).toBe('active');
  });

  it('registers a team via its manager, notifying the manager AND the organizer', async () => {
    publish();
    const team = await teamRepo.create(managerId, 'Falcons');
    const reg = await service.register(managerId, tournamentId, {
      teamId: team.id,
      tournamentAgeGroupId,
    });
    expect(reg.entityType).toBe('team');
    expect(reg.entityId).toBe(team.id);

    const managerNotifs = [...notificationRepo.rows.values()].filter((n) => n.userId === managerId);
    expect(managerNotifs).toHaveLength(1);

    const organizerNotifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === organizerId && n.type === 'new_registration',
    );
    expect(organizerNotifs).toHaveLength(1);
    expect(organizerNotifs[0]!.body).toContain('Falcons');
  });

  it('blocks a team registration when the tournament is draft-based (individuals only)', async () => {
    publish();
    const info = registrationRepo.tournamentInfo.get(tournamentId)!;
    registrationRepo.tournamentInfo.set(tournamentId, {
      ...info,
      teamSelectionMode: 'draft_based',
    });
    const team = await teamRepo.create(managerId, 'Falcons');
    await expect(
      service.register(managerId, tournamentId, { teamId: team.id, tournamentAgeGroupId }),
    ).rejects.toMatchObject({ code: 'TEAM_REGISTRATION_NOT_ALLOWED' });
  });

  it("blocks a manager from registering a team they don't own", async () => {
    publish();
    const team = await teamRepo.create(managerId, 'Falcons');
    const otherManager = (
      await users.create({
        name: 'other',
        email: 'other@example.com',
        passwordHash: 'x',
        roleIds: [4],
      })
    ).id;
    await users.setVerified(otherManager);
    await expect(
      service.register(otherManager, tournamentId, { teamId: team.id, tournamentAgeGroupId }),
    ).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
  });

  it("findMine returns the caller's own registration, player or via a managed team", async () => {
    publish();
    const playerReg = await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    expect(await service.findMine(playerId, tournamentId)).toMatchObject([{ id: playerReg.id }]);
    expect(await service.findMine(managerId, tournamentId)).toHaveLength(0);

    const team = await teamRepo.create(managerId, 'Falcons');
    const teamReg = await service.register(managerId, tournamentId, {
      teamId: team.id,
      tournamentAgeGroupId,
    });
    expect(await service.findMine(managerId, tournamentId)).toMatchObject([{ id: teamReg.id }]);
  });

  it('only the organizer or an admin may list registrations', async () => {
    publish();
    await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    await expect(service.listFor(playerId, tournamentId)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
    const list = await service.listFor(organizerId, tournamentId);
    expect(list).toHaveLength(1);
  });

  it('only a team manager may list recruitable players; withdrawn/team rows are excluded', async () => {
    publish();
    const reg = await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    const team = await teamRepo.create(managerId, 'Falcons');
    await service.register(managerId, tournamentId, { teamId: team.id, tournamentAgeGroupId });

    await expect(service.listRecruitablePlayers(playerId, tournamentId)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });

    const active = await service.listRecruitablePlayers(managerId, tournamentId);
    expect(active).toEqual([
      {
        userId: playerId,
        name: 'player@example.com',
        email: 'player@example.com',
        isManagedChild: false,
        managedByParentName: null,
      },
    ]);

    await service.withdraw(playerId, reg.id);
    expect(await service.listRecruitablePlayers(managerId, tournamentId)).toHaveLength(0);
  });

  it('listDetailFor splits into teams (all statuses, with roster) and players (active only)', async () => {
    publish();
    const info = registrationRepo.tournamentInfo.get(tournamentId)!;
    registrationRepo.tournamentInfo.set(tournamentId, {
      ...info,
      ageGroups: info.ageGroups.map((g) =>
        g.id === tournamentAgeGroupId ? { ...g, capacity: 5 } : g,
      ),
    });
    const team = await teamRepo.create(managerId, 'Falcons');
    const captain = (
      await users.create({
        name: 'Captain',
        email: 'captain@example.com',
        passwordHash: 'x',
        roleIds: [3],
      })
    ).id;
    const declinedPlayer = (
      await users.create({
        name: 'Declined',
        email: 'declined@example.com',
        passwordHash: 'x',
        roleIds: [3],
      })
    ).id;
    await stampConsent(captain);
    await teamRepo.addRosterEntry(team.id, captain, 'captain');
    await teamRepo.setRosterStatus(team.id, captain, 'accepted');
    await teamRepo.addRosterEntry(team.id, declinedPlayer, 'player');
    await teamRepo.setRosterStatus(team.id, declinedPlayer, 'declined');

    const teamReg = await service.register(managerId, tournamentId, {
      teamId: team.id,
      tournamentAgeGroupId,
    });
    const activeReg = await service.register(playerId, tournamentId, { tournamentAgeGroupId });
    const p2 = (
      await users.create({ name: 'p2', email: 'p2@example.com', passwordHash: 'x', roleIds: [3] })
    ).id;
    await users.setVerified(p2);
    await stampConsent(p2);
    const p2Reg = await service.register(p2, tournamentId, { tournamentAgeGroupId });
    await service.withdraw(p2, p2Reg.id);

    await expect(service.listDetailFor(playerId, tournamentId)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });

    const detail = await service.listDetailFor(organizerId, tournamentId);
    expect(detail.teams).toEqual([
      {
        registrationId: teamReg.id,
        teamId: team.id,
        teamName: 'Falcons',
        managerName: 'manager@example.com',
        managerAcademyName: null,
        status: 'active',
        tournamentAgeGroupId,
        capacityOverridden: false,
        teamPaymentStatus: 'unpaid',
        teamPaymentAmountPaid: null,
        roster: expect.arrayContaining([
          {
            userId: captain,
            name: 'Captain',
            roleInTeam: 'captain',
            status: 'accepted',
            eligible: true,
            paymentStatus: 'unpaid',
            paymentAmountPaid: null,
          },
          {
            userId: declinedPlayer,
            name: 'Declined',
            roleInTeam: 'player',
            status: 'declined',
            eligible: true,
            paymentStatus: 'unpaid',
            paymentAmountPaid: null,
          },
        ]),
      },
    ]);
    expect(detail.players).toEqual([
      {
        registrationId: activeReg.id,
        userId: playerId,
        name: 'player@example.com',
        eligible: true,
        paymentStatus: 'unpaid',
        paymentAmountPaid: null,
        tournamentAgeGroupId,
        capacityOverridden: false,
      },
    ]);
  });

  describe('getPlayerContactProfile', () => {
    async function seedPlayerProfile(userId: string, name: string) {
      playerProfileRepo.usersById.set(userId, {
        id: userId,
        name,
        phone: null,
        school: null,
      } as never);
    }

    it("returns the organizer's full profile, including private contact fields, for a solo registrant", async () => {
      publish();
      await seedPlayerProfile(playerId, 'player@example.com');
      const player = await users.findById(playerId);
      player!.phone = '555-0100';
      player!.emergencyContactName = 'Alex Guardian';
      player!.emergencyContactPhone = '555-0199';
      await service.register(playerId, tournamentId, { tournamentAgeGroupId });

      const profile = await service.getPlayerContactProfile(organizerId, tournamentId, playerId);
      expect(profile).toMatchObject({
        id: playerId,
        name: 'player@example.com',
        phone: '555-0100',
        emergencyContactName: 'Alex Guardian',
        emergencyContactPhone: '555-0199',
      });
    });

    it('also works for an accepted member of a registered team roster', async () => {
      publish();
      const team = await teamRepo.create(managerId, 'Falcons');
      await stampConsent(playerId);
      await seedPlayerProfile(playerId, 'player@example.com');
      const player = await users.findById(playerId);
      player!.phone = '555-0200';
      await teamRepo.addRosterEntry(team.id, playerId, 'player');
      await teamRepo.setRosterStatus(team.id, playerId, 'accepted');
      await service.register(managerId, tournamentId, { teamId: team.id, tournamentAgeGroupId });

      const profile = await service.getPlayerContactProfile(organizerId, tournamentId, playerId);
      expect(profile.phone).toBe('555-0200');
    });

    it('rejects a player not actually registered in this tournament, even for its own organizer', async () => {
      publish();
      await seedPlayerProfile(playerId, 'player@example.com');
      await expect(
        service.getPlayerContactProfile(organizerId, tournamentId, playerId),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('rejects a DIFFERENT organizer, even for a player genuinely registered', async () => {
      publish();
      await seedPlayerProfile(playerId, 'player@example.com');
      await service.register(playerId, tournamentId, { tournamentAgeGroupId });
      const otherOrganizerId = (
        await users.create({
          name: 'Other Organizer',
          email: 'other-organizer@example.com',
          passwordHash: 'x',
          roleIds: [2],
        })
      ).id;
      await expect(
        service.getPlayerContactProfile(otherOrganizerId, tournamentId, playerId),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    });

    it('rejects a non-organizer, non-admin actor outright', async () => {
      publish();
      await seedPlayerProfile(playerId, 'player@example.com');
      await service.register(playerId, tournamentId, { tournamentAgeGroupId });
      await expect(
        service.getPlayerContactProfile(managerId, tournamentId, playerId),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    });

    it('withdrawing a registration revokes the organizer’s access to that contact profile', async () => {
      publish();
      await seedPlayerProfile(playerId, 'player@example.com');
      const reg = await service.register(playerId, tournamentId, { tournamentAgeGroupId });
      await service.withdraw(playerId, reg.id);
      await expect(
        service.getPlayerContactProfile(organizerId, tournamentId, playerId),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  it('listDetailFor flags a roster member and a solo player who no longer fit their claimed bracket', async () => {
    publish();
    setAgeBounds(15, 10);

    const team = await teamRepo.create(managerId, 'Falcons');
    const tooOld = (
      await users.create({
        name: 'Too Old',
        email: 'tooold@example.com',
        passwordHash: 'x',
        roleIds: [3],
        dateOfBirth: new Date('1990-01-01'),
      })
    ).id;
    await stampConsent(tooOld);
    await teamRepo.addRosterEntry(team.id, tooOld, 'player');
    await teamRepo.setRosterStatus(team.id, tooOld, 'accepted');
    const teamReg = await service.register(managerId, tournamentId, {
      teamId: team.id,
      tournamentAgeGroupId,
      overrideEligibility: true,
    });

    const detail = await service.listDetailFor(organizerId, tournamentId);
    expect(detail.teams).toEqual([
      {
        registrationId: teamReg.id,
        teamId: team.id,
        teamName: 'Falcons',
        managerName: 'manager@example.com',
        managerAcademyName: null,
        status: 'active',
        tournamentAgeGroupId,
        capacityOverridden: false,
        teamPaymentStatus: 'unpaid',
        teamPaymentAmountPaid: null,
        roster: [
          {
            userId: tooOld,
            name: 'Too Old',
            roleInTeam: 'player',
            eligible: false,
            paymentStatus: 'unpaid',
            paymentAmountPaid: null,
          },
        ].map((m) => ({ ...m, status: 'accepted' })),
      },
    ]);
  });

  describe('updatePayment', () => {
    it("records a solo player's payment and rejects a non-organizer, non-admin actor", async () => {
      publish();
      const reg = await service.register(playerId, tournamentId, { tournamentAgeGroupId });

      await expect(
        service.updatePayment(managerId, reg.id, playerId, 'completed', null),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });

      await service.updatePayment(organizerId, reg.id, playerId, 'partial', 250);
      const detail = await service.listDetailFor(organizerId, tournamentId);
      expect(detail.players).toEqual([
        {
          registrationId: reg.id,
          userId: playerId,
          name: 'player@example.com',
          eligible: true,
          paymentStatus: 'partial',
          paymentAmountPaid: 250,
          tournamentAgeGroupId,
          capacityOverridden: false,
        },
      ]);

      await service.updatePayment(organizerId, reg.id, playerId, 'completed', null);
      const corrected = await service.listDetailFor(organizerId, tournamentId);
      expect(corrected.players[0]).toMatchObject({
        paymentStatus: 'completed',
        paymentAmountPaid: null,
      });

      const entries = audit.actionsOf('registration.payment_updated');
      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({
        actorUserId: organizerId,
        entityType: 'user',
        entityId: playerId,
        meta: {
          status: 'partial',
          amountPaid: 250,
          previousStatus: 'unpaid',
          previousAmountPaid: null,
        },
      });
      expect(entries[1]).toMatchObject({
        meta: {
          status: 'completed',
          amountPaid: null,
          previousStatus: 'partial',
          previousAmountPaid: 250,
        },
      });
    });

    it("records a roster member's payment on a team registration, scoped to that one registration", async () => {
      publish();
      const team = await teamRepo.create(managerId, 'Falcons');
      await stampConsent(playerId);
      await teamRepo.addRosterEntry(team.id, playerId, 'player');
      await teamRepo.setRosterStatus(team.id, playerId, 'accepted');
      const reg = await service.register(managerId, tournamentId, {
        teamId: team.id,
        tournamentAgeGroupId,
      });

      await service.updatePayment(organizerId, reg.id, playerId, 'completed', null);
      const detail = await service.listDetailFor(organizerId, tournamentId);
      expect(detail.teams[0]!.roster).toEqual([
        {
          userId: playerId,
          name: 'player@example.com',
          roleInTeam: 'player',
          status: 'accepted',
          eligible: true,
          paymentStatus: 'completed',
          paymentAmountPaid: null,
        },
      ]);
    });

    it("rejects recording payment for someone who isn't part of the registration", async () => {
      publish();
      const reg = await service.register(playerId, tournamentId, { tournamentAgeGroupId });
      await expect(
        service.updatePayment(organizerId, reg.id, managerId, 'completed', null),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('updateTeamPayment', () => {
    it("records one lump-sum payment for a team registration, separate from any roster member's own payment", async () => {
      publish();
      const team = await teamRepo.create(managerId, 'Falcons');
      await stampConsent(playerId);
      await teamRepo.addRosterEntry(team.id, playerId, 'player');
      await teamRepo.setRosterStatus(team.id, playerId, 'accepted');
      const reg = await service.register(managerId, tournamentId, {
        teamId: team.id,
        tournamentAgeGroupId,
      });

      await expect(
        service.updateTeamPayment(managerId, reg.id, 'completed', null),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });

      await service.updateTeamPayment(organizerId, reg.id, 'partial', 500);
      const detail = await service.listDetailFor(organizerId, tournamentId);
      expect(detail.teams[0]).toMatchObject({
        teamPaymentStatus: 'partial',
        teamPaymentAmountPaid: 500,
      });
      expect(detail.teams[0]!.roster[0]).toMatchObject({
        paymentStatus: 'unpaid',
        paymentAmountPaid: null,
      });

      const entries = audit.actionsOf('registration.team_payment_updated');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        actorUserId: organizerId,
        entityType: 'registration',
        entityId: reg.id,
        meta: {
          status: 'partial',
          amountPaid: 500,
          previousStatus: 'unpaid',
          previousAmountPaid: null,
        },
      });
    });

    it('rejects team payment on a solo player registration — nothing to distinguish it from that player’s own payment', async () => {
      publish();
      const reg = await service.register(playerId, tournamentId, { tournamentAgeGroupId });
      await expect(
        service.updateTeamPayment(organizerId, reg.id, 'completed', null),
      ).rejects.toMatchObject({ code: 'NOT_A_TEAM_REGISTRATION' });
    });
  });

  it('a team manager can override an ineligible roster member with a warning, but self-registration and a parent cannot', async () => {
    publish();
    setAgeBounds(15, 10);

    const team = await teamRepo.create(managerId, 'Falcons');
    const tooOld = (
      await users.create({
        name: 'Too Old',
        email: 'tooold2@example.com',
        passwordHash: 'x',
        roleIds: [3],
        dateOfBirth: new Date('1990-01-01'),
      })
    ).id;
    await users.setVerified(tooOld);
    await stampConsent(tooOld);
    await teamRepo.addRosterEntry(team.id, tooOld, 'player');
    await teamRepo.setRosterStatus(team.id, tooOld, 'accepted');

    await expect(
      service.register(managerId, tournamentId, { teamId: team.id, tournamentAgeGroupId }),
    ).rejects.toMatchObject({ code: 'AGE_GROUP_MISMATCH' });

    const reg = await service.register(managerId, tournamentId, {
      teamId: team.id,
      tournamentAgeGroupId,
      overrideEligibility: true,
    });
    expect(reg.status).toBe('active');

    const u = await users.findById(tooOld);
    u!.dateOfBirth = new Date('1990-01-01');
    await expect(
      service.register(tooOld, tournamentId, {
        tournamentAgeGroupId,
        overrideEligibility: true,
      }),
    ).rejects.toMatchObject({ code: 'AGE_GROUP_MISMATCH' });
  });

  it('only a player may list recruiting teams; withdrawn/player rows are excluded', async () => {
    publish();
    const team = await teamRepo.create(managerId, 'Falcons');
    const teamReg = await service.register(managerId, tournamentId, {
      teamId: team.id,
      tournamentAgeGroupId,
    });
    await service.register(playerId, tournamentId, { tournamentAgeGroupId });

    await expect(service.listRecruitingTeams(managerId, tournamentId)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });

    const active = await service.listRecruitingTeams(playerId, tournamentId);
    expect(active).toEqual([{ teamId: team.id, name: 'Falcons' }]);

    await service.withdraw(managerId, teamReg.id);
    expect(await service.listRecruitingTeams(playerId, tournamentId)).toHaveLength(0);
  });

  describe('cricket-profile consent gate (PROFILE_INCOMPLETE)', () => {
    it('blocks self-registration until the consent step is completed, then allows it', async () => {
      publish();
      const noProfile = (
        await users.create({
          name: 'No Profile',
          email: 'noprofile@example.com',
          passwordHash: 'x',
          roleIds: [3],
        })
      ).id;
      await users.setVerified(noProfile);
      await expect(
        service.register(noProfile, tournamentId, { tournamentAgeGroupId }),
      ).rejects.toMatchObject({
        code: 'PROFILE_INCOMPLETE',
      });

      await stampConsent(noProfile);
      const reg = await service.register(noProfile, tournamentId, { tournamentAgeGroupId });
      expect(reg.status).toBe('active');
    });

    it('blocks a team registration if even one accepted roster member lacks consent, naming them', async () => {
      publish();
      const team = await teamRepo.create(managerId, 'Falcons');
      const noProfile = (
        await users.create({
          name: 'No Profile',
          email: 'noprofile2@example.com',
          passwordHash: 'x',
          roleIds: [3],
        })
      ).id;
      await teamRepo.addRosterEntry(team.id, noProfile, 'player');
      await teamRepo.setRosterStatus(team.id, noProfile, 'accepted');

      await expect(
        service.register(managerId, tournamentId, { teamId: team.id, tournamentAgeGroupId }),
      ).rejects.toMatchObject({ code: 'PROFILE_INCOMPLETE' });

      await stampConsent(noProfile);
      const reg = await service.register(managerId, tournamentId, {
        teamId: team.id,
        tournamentAgeGroupId,
      });
      expect(reg.status).toBe('active');
    });

    it('a pending (not-yet-accepted) roster member without consent does not block the team', async () => {
      publish();
      const team = await teamRepo.create(managerId, 'Falcons');
      const invited = (
        await users.create({
          name: 'Invited',
          email: 'invited@example.com',
          passwordHash: 'x',
          roleIds: [3],
        })
      ).id;
      await teamRepo.addRosterEntry(team.id, invited, 'player');
      const reg = await service.register(managerId, tournamentId, {
        teamId: team.id,
        tournamentAgeGroupId,
      });
      expect(reg.status).toBe('active');
    });

    it('registerChild blocks a parent from registering a child who has not completed the cricket profile', async () => {
      publish();
      const child = await parents.addChild(parentId, { name: 'Kid', dateOfBirth: '2015-01-01' });
      await expect(
        service.registerChild(parentId, child.id, tournamentId, tournamentAgeGroupId, undefined),
      ).rejects.toMatchObject({ code: 'PROFILE_INCOMPLETE' });

      await stampConsent(child.id);
      const reg = await service.registerChild(
        parentId,
        child.id,
        tournamentId,
        tournamentAgeGroupId,
        undefined,
      );
      expect(reg.status).toBe('active');
    });
  });
});
