import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { RegistrationService } from '../../src/modules/registrations/registration.service';
import { TournamentInvitationService } from '../../src/modules/registrations/tournamentInvitation.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import {
  FakeAudit,
  FakeNotificationRepo,
  FakeOrganizerTournamentRepo,
  FakeRegistrationRepo,
  FakeTeamRepo,
  FakeTournamentInvitationRepo,
  FakeUserRepo,
  MailboxAdapter,
  fakeTx,
  makeFakeParentService,
} from '../helpers/fakes';

describe('TournamentInvitationService', () => {
  let users: FakeUserRepo;
  let teamRepo: FakeTeamRepo;
  let tournamentRepo: FakeOrganizerTournamentRepo;
  let registrationRepo: FakeRegistrationRepo;
  let invitationRepo: FakeTournamentInvitationRepo;
  let notificationRepo: FakeNotificationRepo;
  let registrations: RegistrationService;
  let service: TournamentInvitationService;
  let organizerId: string;
  let managerId: string;
  let tournamentId: string;
  let tournamentAgeGroupId: string;
  let teamId: string;

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
    const authz = new AuthzService(users);
    const audit = new FakeAudit();
    registrations = new RegistrationService({
      registrations: registrationRepo,
      users,
      teams: teamRepo,
      tournaments: tournamentRepo,
      notifications,
      authz,
      audit,
      tx: fakeTx,
      parents: makeFakeParentService(users, audit),
      playerProfile: { getProfile: () => Promise.reject(new Error('not used in this test')) },
    });
    invitationRepo = new FakeTournamentInvitationRepo({
      tournaments: new Map(),
      teams: teamRepo,
      users,
    });
    service = new TournamentInvitationService({
      invitations: invitationRepo,
      teams: teamRepo,
      users,
      tournaments: tournamentRepo,
      registrations,
      notifications,
      authz,
      parents: makeFakeParentService(users, audit),
    });

    const mk = async (email: string, roleIds: number[]) => {
      const u = await users.create({ name: email, email, passwordHash: await hash('x'), roleIds });
      await users.setVerified(u.id);
      return u.id;
    };
    organizerId = await mk('organizer@example.com', [2]);
    managerId = await mk('manager@example.com', [4]);

    const DAY = 86_400_000;
    const t = await tournamentRepo.create(organizerId, {
      name: 'Spring Cup',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-10'),
      capacity: 8,
      ageGroups: [
        {
          ageGroupId: 'age-open',
          bornAfter: null,
          bornBefore: null,
          genderCategory: 'mixed',
          registrationStartDate: new Date(Date.now() - 30 * DAY),
          registrationEndDate: new Date(Date.now() + 30 * DAY),
          capacity: 8,
          format: 'T20',
          entryFee: null,
          oversPerInnings: null,
        },
      ],
    });
    tournamentId = t.id;
    tournamentAgeGroupId = t.ageGroups[0]!.id;
    await tournamentRepo.updateStatus(tournamentId, 'published');
    registrationRepo.tournamentInfo.set(tournamentId, {
      status: 'published',
      startDate: new Date('2026-08-01'),
      teamSelectionMode: 'prebuilt_rosters',
      ageGroups: [
        {
          id: tournamentAgeGroupId,
          bornAfter: null,
          bornBefore: null,
          genderCategory: 'mixed',
          registrationStartDate: new Date(Date.now() - 30 * DAY),
          registrationEndDate: new Date(Date.now() + 30 * DAY),
          capacity: 8,
        },
      ],
    });
    invitationRepo.names!.tournaments.set(tournamentId, 'Spring Cup');

    const team = await teamRepo.create(managerId, 'Falcons');
    teamId = team.id;
  });

  async function mkPlayer(email: string, dateOfBirth?: Date) {
    const u = await users.create({
      name: email,
      email,
      passwordHash: await hash('x'),
      roleIds: [3],
      dateOfBirth,
    });
    await users.setVerified(u.id);
    const row = await users.findById(u.id);
    row!.consentAcceptedAt = new Date();
    return u.id;
  }

  describe('invitePlayer + a player responding themself', () => {
    it('only the organizer or admin may invite a player', async () => {
      const playerId = await mkPlayer('kid@example.com');
      await expect(
        service.invitePlayer(managerId, tournamentId, playerId, tournamentAgeGroupId, false),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
      const invitation = await service.invitePlayer(
        organizerId,
        tournamentId,
        playerId,
        tournamentAgeGroupId,
        false,
      );
      expect(invitation.status).toBe('invited');
      expect(invitation.entityType).toBe('player');
      expect(invitation.entityId).toBe(playerId);
    });

    it('rejects a second pending invite for the same player', async () => {
      const playerId = await mkPlayer('kid2@example.com');
      await service.invitePlayer(organizerId, tournamentId, playerId, tournamentAgeGroupId, false);
      await expect(
        service.invitePlayer(organizerId, tournamentId, playerId, tournamentAgeGroupId, false),
      ).rejects.toMatchObject({ code: 'INVITE_PENDING' });
    });

    it('the player can decline, which never creates a registration, and tells the organizer', async () => {
      const playerId = await mkPlayer('kid3@example.com');
      const invitation = await service.invitePlayer(
        organizerId,
        tournamentId,
        playerId,
        tournamentAgeGroupId,
        false,
      );
      await service.respond(playerId, invitation.id, 'decline');
      const list = await service.listForTournament(organizerId, tournamentId);
      expect(list[0]!.status).toBe('declined');
      expect(await registrationRepo.countActive(tournamentAgeGroupId, 'player')).toBe(0);
    });

    it('the player can accept, which registers them through the normal path', async () => {
      const playerId = await mkPlayer('kid4@example.com');
      const invitation = await service.invitePlayer(
        organizerId,
        tournamentId,
        playerId,
        tournamentAgeGroupId,
        false,
      );
      await service.respond(playerId, invitation.id, 'accept');
      const list = await service.listForTournament(organizerId, tournamentId);
      expect(list[0]!.status).toBe('accepted');
      expect(await registrationRepo.countActive(tournamentAgeGroupId, 'player')).toBe(1);
    });

    it('blocks someone other than the invited player from responding on their behalf', async () => {
      const playerId = await mkPlayer('kid5@example.com');
      const invitation = await service.invitePlayer(
        organizerId,
        tournamentId,
        playerId,
        tournamentAgeGroupId,
        false,
      );
      await expect(service.respond(managerId, invitation.id, 'accept')).rejects.toMatchObject({
        code: 'NOT_ALLOWED',
      });
    });

    it('warns the organizer at invite time when the player is age-ineligible, and lets them override', async () => {
      const yearsAgo = (n: number) => {
        const d = new Date();
        d.setUTCFullYear(d.getUTCFullYear() - n);
        return d;
      };
      const row = tournamentRepo.rows.get(tournamentId)!;
      row.ageGroups[0]!.bornAfter = yearsAgo(15);
      row.ageGroups[0]!.bornBefore = yearsAgo(10);
      const info = registrationRepo.tournamentInfo.get(tournamentId)!;
      registrationRepo.tournamentInfo.set(tournamentId, {
        ...info,
        ageGroups: [{ ...info.ageGroups[0]!, bornAfter: yearsAgo(15), bornBefore: yearsAgo(10) }],
      });

      const tooOld = await mkPlayer('tooold@example.com', new Date('1990-01-01'));

      await expect(
        service.invitePlayer(organizerId, tournamentId, tooOld, tournamentAgeGroupId, false),
      ).rejects.toMatchObject({ code: 'AGE_GROUP_MISMATCH' });

      const invitation = await service.invitePlayer(
        organizerId,
        tournamentId,
        tooOld,
        tournamentAgeGroupId,
        true,
      );
      expect(invitation.status).toBe('invited');

      await service.respond(tooOld, invitation.id, 'accept');
      expect(await registrationRepo.countActive(tournamentAgeGroupId, 'player')).toBe(1);
    });

    it('warns the organizer at invite time when the bracket window is closed, and lets them override', async () => {
      const row = tournamentRepo.rows.get(tournamentId)!;
      row.ageGroups[0]!.registrationStartDate = new Date('2019-01-01');
      row.ageGroups[0]!.registrationEndDate = new Date('2020-01-01');
      const info = registrationRepo.tournamentInfo.get(tournamentId)!;
      registrationRepo.tournamentInfo.set(tournamentId, {
        ...info,
        ageGroups: [
          {
            ...info.ageGroups[0]!,
            registrationStartDate: new Date('2019-01-01'),
            registrationEndDate: new Date('2020-01-01'),
          },
        ],
      });

      const playerId = await mkPlayer('window-closed@example.com');

      await expect(
        service.invitePlayer(organizerId, tournamentId, playerId, tournamentAgeGroupId, false),
      ).rejects.toMatchObject({ code: 'REGISTRATION_WINDOW_CLOSED' });

      const invitation = await service.invitePlayer(
        organizerId,
        tournamentId,
        playerId,
        tournamentAgeGroupId,
        false,
        true,
      );
      expect(invitation.status).toBe('invited');

      await service.respond(playerId, invitation.id, 'accept');
      expect(await registrationRepo.countActive(tournamentAgeGroupId, 'player')).toBe(1);
    });

    it("distinguishes a bracket that hasn't opened yet from one that's already closed", async () => {
      const row = tournamentRepo.rows.get(tournamentId)!;
      row.ageGroups[0]!.registrationStartDate = new Date('2099-01-01');
      row.ageGroups[0]!.registrationEndDate = new Date('2099-02-01');
      const info = registrationRepo.tournamentInfo.get(tournamentId)!;
      registrationRepo.tournamentInfo.set(tournamentId, {
        ...info,
        ageGroups: [
          {
            ...info.ageGroups[0]!,
            registrationStartDate: new Date('2099-01-01'),
            registrationEndDate: new Date('2099-02-01'),
          },
        ],
      });

      const playerId = await mkPlayer('window-not-open@example.com');

      await expect(
        service.invitePlayer(organizerId, tournamentId, playerId, tournamentAgeGroupId, false),
      ).rejects.toMatchObject({ code: 'REGISTRATION_NOT_YET_OPEN' });
    });
  });

  it('only the organizer or admin may invite a team', async () => {
    await expect(
      service.invite(managerId, tournamentId, teamId, tournamentAgeGroupId),
    ).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
    const invitation = await service.invite(
      organizerId,
      tournamentId,
      teamId,
      tournamentAgeGroupId,
    );
    expect(invitation.status).toBe('invited');
  });

  it('rejects a second pending invite for the same team', async () => {
    await service.invite(organizerId, tournamentId, teamId, tournamentAgeGroupId);
    await expect(
      service.invite(organizerId, tournamentId, teamId, tournamentAgeGroupId),
    ).rejects.toMatchObject({
      code: 'INVITE_PENDING',
    });
  });

  it('refuses to invite a team into a draft-based tournament', async () => {
    const draft = await tournamentRepo.create(organizerId, {
      name: 'Draft Cup',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-10'),
      capacity: 8,
      teamSelectionMode: 'draft_based',
      ageGroups: [
        {
          ageGroupId: 'age-open',
          bornAfter: null,
          bornBefore: null,
          genderCategory: 'mixed',
          registrationStartDate: new Date(Date.now() - 86_400_000),
          registrationEndDate: new Date(Date.now() + 86_400_000),
          capacity: null,
          format: 'T20',
          entryFee: null,
          oversPerInnings: null,
        },
      ],
    });
    await tournamentRepo.updateStatus(draft.id, 'published');
    await expect(
      service.invite(organizerId, draft.id, teamId, draft.ageGroups[0]!.id),
    ).rejects.toMatchObject({
      code: 'TEAM_INVITE_NOT_ALLOWED',
    });
  });

  it('the manager can decline, which never creates a registration, and tells the organizer', async () => {
    const invitation = await service.invite(
      organizerId,
      tournamentId,
      teamId,
      tournamentAgeGroupId,
    );
    await service.respond(managerId, invitation.id, 'decline');
    const list = await service.listForTournament(organizerId, tournamentId);
    expect(list[0]!.status).toBe('declined');
    expect(await registrationRepo.countActive(tournamentAgeGroupId, 'team')).toBe(0);

    const organizerNotifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === organizerId && n.type === 'tournament_invitation_declined',
    );
    expect(organizerNotifs).toHaveLength(1);
    expect(organizerNotifs[0]!.body).toContain('Falcons');
    expect(organizerNotifs[0]!.body).toContain('Spring Cup');
  });

  it('the manager can accept, which registers the team through the normal path', async () => {
    const invitation = await service.invite(
      organizerId,
      tournamentId,
      teamId,
      tournamentAgeGroupId,
    );
    await service.respond(managerId, invitation.id, 'accept');
    const list = await service.listForTournament(organizerId, tournamentId);
    expect(list[0]!.status).toBe('accepted');
    expect(await registrationRepo.countActive(tournamentAgeGroupId, 'team')).toBe(1);
  });

  it('blocks a non-manager from responding', async () => {
    const invitation = await service.invite(
      organizerId,
      tournamentId,
      teamId,
      tournamentAgeGroupId,
    );
    await expect(service.respond(organizerId, invitation.id, 'accept')).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
  });

  it('warns the organizer at invite time when a roster member is ineligible, and lets them override', async () => {
    const yearsAgo = (n: number) => {
      const d = new Date();
      d.setUTCFullYear(d.getUTCFullYear() - n);
      return d;
    };
    const row = tournamentRepo.rows.get(tournamentId)!;
    row.ageGroups[0]!.bornAfter = yearsAgo(15);
    row.ageGroups[0]!.bornBefore = yearsAgo(10);
    const info = registrationRepo.tournamentInfo.get(tournamentId)!;
    registrationRepo.tournamentInfo.set(tournamentId, {
      ...info,
      ageGroups: [{ ...info.ageGroups[0]!, bornAfter: yearsAgo(15), bornBefore: yearsAgo(10) }],
    });
    const tooOld = (
      await users.create({
        name: 'Too Old',
        email: 'tooold-roster@example.com',
        passwordHash: await hash('x'),
        roleIds: [3],
        dateOfBirth: new Date('1990-01-01'),
      })
    ).id;
    (await users.findById(tooOld))!.consentAcceptedAt = new Date();
    await teamRepo.addRosterEntry(teamId, tooOld, 'player');
    await teamRepo.setRosterStatus(teamId, tooOld, 'accepted');

    await expect(
      service.invite(organizerId, tournamentId, teamId, tournamentAgeGroupId),
    ).rejects.toMatchObject({ code: 'AGE_GROUP_MISMATCH' });

    const invitation = await service.invite(
      organizerId,
      tournamentId,
      teamId,
      tournamentAgeGroupId,
      false,
      true,
    );
    await service.respond(managerId, invitation.id, 'accept');
    expect(await registrationRepo.countActive(tournamentAgeGroupId, 'team')).toBe(1);
  });

  it('accepting a team invitation always succeeds regardless of roster eligibility, even without an organizer override', async () => {
    const yearsAgo = (n: number) => {
      const d = new Date();
      d.setUTCFullYear(d.getUTCFullYear() - n);
      return d;
    };
    const info = registrationRepo.tournamentInfo.get(tournamentId)!;
    registrationRepo.tournamentInfo.set(tournamentId, {
      ...info,
      ageGroups: [{ ...info.ageGroups[0]!, bornAfter: yearsAgo(15), bornBefore: yearsAgo(10) }],
    });
    const invitation = await service.invite(
      organizerId,
      tournamentId,
      teamId,
      tournamentAgeGroupId,
    );
    const tooOld = (
      await users.create({
        name: 'Too Old',
        email: 'tooold-late-add@example.com',
        passwordHash: await hash('x'),
        roleIds: [3],
        dateOfBirth: new Date('1990-01-01'),
      })
    ).id;
    (await users.findById(tooOld))!.consentAcceptedAt = new Date();
    await teamRepo.addRosterEntry(teamId, tooOld, 'player');
    await teamRepo.setRosterStatus(teamId, tooOld, 'accepted');

    await service.respond(managerId, invitation.id, 'accept');
    expect(await registrationRepo.countActive(tournamentAgeGroupId, 'team')).toBe(1);
  });

  it('rejects responding twice', async () => {
    const invitation = await service.invite(
      organizerId,
      tournamentId,
      teamId,
      tournamentAgeGroupId,
    );
    await service.respond(managerId, invitation.id, 'decline');
    await expect(service.respond(managerId, invitation.id, 'accept')).rejects.toMatchObject({
      code: 'INVALID_STATUS',
    });
  });

  it('race: two concurrent accepts on the same invitation — only the winner registers, the loser gets a clean already-responded error', async () => {
    const invitation = await service.invite(
      organizerId,
      tournamentId,
      teamId,
      tournamentAgeGroupId,
    );

    const [first, race] = await Promise.allSettled([
      service.respond(managerId, invitation.id, 'accept'),
      service.respond(managerId, invitation.id, 'accept'),
    ]);

    const outcomes = [first, race];
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((o) => o.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason).toMatchObject({ code: 'INVALID_STATUS' });

    expect(await registrationRepo.countActive(tournamentAgeGroupId, 'team')).toBe(1);
    const list = await service.listForTournament(organizerId, tournamentId);
    expect(list[0]!.status).toBe('accepted');
  });

  it('rolls the invitation back to invited when accept genuinely fails to register (not a race)', async () => {
    const invitation = await service.invite(
      organizerId,
      tournamentId,
      teamId,
      tournamentAgeGroupId,
    );
    await registrations.register(managerId, tournamentId, { teamId, tournamentAgeGroupId });

    await expect(service.respond(managerId, invitation.id, 'accept')).rejects.toMatchObject({
      code: 'ALREADY_REGISTERED',
    });

    const list = await service.listForTournament(organizerId, tournamentId);
    expect(list[0]!.status).toBe('invited');
    expect(await registrationRepo.countActive(tournamentAgeGroupId, 'team')).toBe(1);
  });

  it('warns the organizer at invite time when the bracket window is closed for a team invite too, and lets them override', async () => {
    const row = tournamentRepo.rows.get(tournamentId)!;
    row.ageGroups[0]!.registrationStartDate = new Date('2019-01-01');
    row.ageGroups[0]!.registrationEndDate = new Date('2020-01-01');
    const info = registrationRepo.tournamentInfo.get(tournamentId)!;
    registrationRepo.tournamentInfo.set(tournamentId, {
      ...info,
      ageGroups: [
        {
          ...info.ageGroups[0]!,
          registrationStartDate: new Date('2019-01-01'),
          registrationEndDate: new Date('2020-01-01'),
        },
      ],
    });

    await expect(
      service.invite(organizerId, tournamentId, teamId, tournamentAgeGroupId),
    ).rejects.toMatchObject({ code: 'REGISTRATION_WINDOW_CLOSED' });

    const invitation = await service.invite(
      organizerId,
      tournamentId,
      teamId,
      tournamentAgeGroupId,
      true,
    );
    await service.respond(managerId, invitation.id, 'accept');
    expect(await registrationRepo.countActive(tournamentAgeGroupId, 'team')).toBe(1);
  });

  it("distinguishes a bracket that hasn't opened yet from one that's already closed for a team invite too", async () => {
    const row = tournamentRepo.rows.get(tournamentId)!;
    row.ageGroups[0]!.registrationStartDate = new Date('2099-01-01');
    row.ageGroups[0]!.registrationEndDate = new Date('2099-02-01');
    const info = registrationRepo.tournamentInfo.get(tournamentId)!;
    registrationRepo.tournamentInfo.set(tournamentId, {
      ...info,
      ageGroups: [
        {
          ...info.ageGroups[0]!,
          registrationStartDate: new Date('2099-01-01'),
          registrationEndDate: new Date('2099-02-01'),
        },
      ],
    });

    await expect(
      service.invite(organizerId, tournamentId, teamId, tournamentAgeGroupId),
    ).rejects.toMatchObject({ code: 'REGISTRATION_NOT_YET_OPEN' });
  });

  describe('capacity override', () => {
    it('blocks a team invite once the tournament is full, and lets it through with overrideCapacity — the resulting registration stays flagged', async () => {
      const info = registrationRepo.tournamentInfo.get(tournamentId)!;
      registrationRepo.tournamentInfo.set(tournamentId, {
        ...info,
        ageGroups: info.ageGroups.map((g) =>
          g.id === tournamentAgeGroupId ? { ...g, capacity: 1 } : g,
        ),
      });
      await registrations.register(managerId, tournamentId, { teamId, tournamentAgeGroupId });
      const bracket1 = tournamentRepo.rows
        .get(tournamentId)!
        .ageGroups.find((g) => g.id === tournamentAgeGroupId)!;
      bracket1.capacity = 1;
      bracket1.registeredCount = 1;

      const secondManager = (
        await users.create({
          name: 'second-manager@example.com',
          email: 'second-manager@example.com',
          passwordHash: await hash('x'),
          roleIds: [4],
        })
      ).id;
      await users.setVerified(secondManager);
      const secondTeam = await teamRepo.create(secondManager, 'Eagles');

      await expect(
        service.invite(organizerId, tournamentId, secondTeam.id, tournamentAgeGroupId),
      ).rejects.toMatchObject({ code: 'TOURNAMENT_FULL' });

      const invitation = await service.invite(
        organizerId,
        tournamentId,
        secondTeam.id,
        tournamentAgeGroupId,
        false,
        false,
        true,
      );
      expect(invitation.capacityOverridden).toBe(true);

      await service.respond(secondManager, invitation.id, 'accept');
      expect(await registrationRepo.countActive(tournamentAgeGroupId, 'team')).toBe(2);
      const detail = await registrations.listDetailFor(organizerId, tournamentId);
      const secondReg = detail.teams.find((t) => t.teamId === secondTeam.id);
      expect(secondReg?.capacityOverridden).toBe(true);
      const firstReg = detail.teams.find((t) => t.teamId === teamId);
      expect(firstReg?.capacityOverridden).toBe(false);
    });

    it('never capacity-checks a solo player invite in prebuilt_rosters mode, even when full', async () => {
      const bracket2 = tournamentRepo.rows
        .get(tournamentId)!
        .ageGroups.find((g) => g.id === tournamentAgeGroupId)!;
      bracket2.capacity = 0;
      bracket2.registeredCount = 0;
      const playerId = await mkPlayer('solo-when-full@example.com');
      const invitation = await service.invitePlayer(
        organizerId,
        tournamentId,
        playerId,
        tournamentAgeGroupId,
        false,
      );
      expect(invitation.capacityOverridden).toBe(false);
    });

    it('blocks a player invite once a draft-based tournament is full, and lets it through with overrideCapacity', async () => {
      const info = registrationRepo.tournamentInfo.get(tournamentId)!;
      registrationRepo.tournamentInfo.set(tournamentId, {
        ...info,
        teamSelectionMode: 'draft_based',
        ageGroups: info.ageGroups.map((g) =>
          g.id === tournamentAgeGroupId ? { ...g, capacity: 0 } : g,
        ),
      });
      tournamentRepo.rows.get(tournamentId)!.teamSelectionMode = 'draft_based';
      const bracket3 = tournamentRepo.rows
        .get(tournamentId)!
        .ageGroups.find((g) => g.id === tournamentAgeGroupId)!;
      bracket3.capacity = 0;
      bracket3.registeredCount = 0;

      const playerId = await mkPlayer('draft-when-full@example.com');
      await expect(
        service.invitePlayer(organizerId, tournamentId, playerId, tournamentAgeGroupId, false),
      ).rejects.toMatchObject({ code: 'TOURNAMENT_FULL' });

      const invitation = await service.invitePlayer(
        organizerId,
        tournamentId,
        playerId,
        tournamentAgeGroupId,
        false,
        false,
        true,
      );
      expect(invitation.capacityOverridden).toBe(true);

      await service.respond(playerId, invitation.id, 'accept');
      expect(await registrationRepo.countActive(tournamentAgeGroupId, 'player')).toBe(1);
    });

    it('checks capacity against the SPECIFIC bracket being invited to, not the whole tournament', async () => {
      const bracketA = tournamentRepo.rows
        .get(tournamentId)!
        .ageGroups.find((g) => g.id === tournamentAgeGroupId)!;
      bracketA.capacity = 1;
      bracketA.registeredCount = 1;

      const secondBracket = {
        id: 'tag-second',
        ageGroupId: 'age-open',
        name: 'Open',
        bornAfter: null,
        bornBefore: null,
        genderCategory: 'mixed' as const,
        registrationStartDate: new Date(Date.now() - 86_400_000),
        registrationEndDate: new Date(Date.now() + 86_400_000),
        capacity: 5,
        registeredCount: 0,
        format: 'T20',
        entryFee: null,
        oversPerInnings: null,
      };
      tournamentRepo.rows.get(tournamentId)!.ageGroups.push(secondBracket);

      const secondTeam = await teamRepo.create(managerId, 'Second Team');
      await expect(
        service.invite(organizerId, tournamentId, secondTeam.id, tournamentAgeGroupId),
      ).rejects.toMatchObject({ code: 'TOURNAMENT_FULL' });
      const invitation = await service.invite(
        organizerId,
        tournamentId,
        secondTeam.id,
        secondBracket.id,
      );
      expect(invitation.capacityOverridden).toBe(false);
    });
  });
});

describe('TournamentInvitationService.respondForChild', () => {
  let users: FakeUserRepo;
  let teamRepo: FakeTeamRepo;
  let tournamentRepo: FakeOrganizerTournamentRepo;
  let registrationRepo: FakeRegistrationRepo;
  let invitationRepo: FakeTournamentInvitationRepo;
  let notificationRepo: FakeNotificationRepo;
  let service: TournamentInvitationService;
  let organizerId: string;
  let parentId: string;
  let otherParentId: string;
  let childId: string;
  let tournamentId: string;
  let tournamentAgeGroupId: string;

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
    const authz = new AuthzService(users);
    const audit = new FakeAudit();
    const parentService = makeFakeParentService(users, audit);
    const registrations = new RegistrationService({
      registrations: registrationRepo,
      users,
      teams: teamRepo,
      tournaments: tournamentRepo,
      notifications,
      authz,
      audit,
      tx: fakeTx,
      parents: parentService,
      playerProfile: { getProfile: () => Promise.reject(new Error('not used in this test')) },
    });
    invitationRepo = new FakeTournamentInvitationRepo({
      tournaments: new Map(),
      teams: teamRepo,
      users,
    });
    service = new TournamentInvitationService({
      invitations: invitationRepo,
      teams: teamRepo,
      users,
      tournaments: tournamentRepo,
      registrations,
      notifications,
      authz,
      parents: parentService,
    });

    const DAY = 86_400_000;
    organizerId = (
      await users.create({
        name: 'organizer@example.com',
        email: 'organizer@example.com',
        passwordHash: await hash('x'),
        roleIds: [2],
      })
    ).id;
    await users.setVerified(organizerId);
    parentId = (
      await users.create({
        name: 'parent@example.com',
        email: 'parent@example.com',
        passwordHash: await hash('x'),
        roleIds: [7],
      })
    ).id;
    otherParentId = (
      await users.create({
        name: 'other-parent@example.com',
        email: 'other-parent@example.com',
        passwordHash: await hash('x'),
        roleIds: [7],
      })
    ).id;
    childId = (
      await users.create({
        name: 'Child One',
        email: 'child-one@no-login.nforcearena.internal',
        passwordHash: 'x',
        roleIds: [3],
        dateOfBirth: new Date('2015-01-01'),
        managedByParentId: parentId,
      })
    ).id;
    (await users.findById(childId))!.consentAcceptedAt = new Date();

    const t = await tournamentRepo.create(organizerId, {
      name: 'Junior Cup',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-10'),
      capacity: 8,
      ageGroups: [
        {
          ageGroupId: 'age-open',
          bornAfter: null,
          bornBefore: null,
          genderCategory: 'mixed',
          registrationStartDate: new Date(Date.now() - 30 * DAY),
          registrationEndDate: new Date(Date.now() + 30 * DAY),
          capacity: 8,
          format: 'T20',
          entryFee: null,
          oversPerInnings: null,
        },
      ],
    });
    tournamentId = t.id;
    tournamentAgeGroupId = t.ageGroups[0]!.id;
    await tournamentRepo.updateStatus(tournamentId, 'published');
    registrationRepo.tournamentInfo.set(tournamentId, {
      status: 'published',
      startDate: new Date('2026-08-01'),
      teamSelectionMode: 'prebuilt_rosters',
      ageGroups: [
        {
          id: tournamentAgeGroupId,
          bornAfter: null,
          bornBefore: null,
          genderCategory: 'mixed',
          registrationStartDate: new Date(Date.now() - 30 * DAY),
          registrationEndDate: new Date(Date.now() + 30 * DAY),
          capacity: 8,
        },
      ],
    });
    invitationRepo.names!.tournaments.set(tournamentId, 'Junior Cup');
  });

  it("lets the owning parent accept on the child's behalf", async () => {
    const invitation = await service.invitePlayer(
      organizerId,
      tournamentId,
      childId,
      tournamentAgeGroupId,
      false,
    );
    await service.respondForChild(parentId, childId, invitation.id, 'accept');
    const list = await service.listForTournament(organizerId, tournamentId);
    expect(list[0]!.status).toBe('accepted');
    expect(await registrationRepo.countActive(tournamentAgeGroupId, 'player')).toBe(1);
  });

  it("lets the owning parent decline on the child's behalf, and tells the organizer", async () => {
    const invitation = await service.invitePlayer(
      organizerId,
      tournamentId,
      childId,
      tournamentAgeGroupId,
      false,
    );
    await service.respondForChild(parentId, childId, invitation.id, 'decline');
    const list = await service.listForTournament(organizerId, tournamentId);
    expect(list[0]!.status).toBe('declined');
    expect(await registrationRepo.countActive(tournamentAgeGroupId, 'player')).toBe(0);
    const organizerNotifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === organizerId && n.type === 'tournament_invitation_declined',
    );
    expect(organizerNotifs).toHaveLength(1);
  });

  it("blocks a parent who doesn't own the child", async () => {
    const invitation = await service.invitePlayer(
      organizerId,
      tournamentId,
      childId,
      tournamentAgeGroupId,
      false,
    );
    await expect(
      service.respondForChild(otherParentId, childId, invitation.id, 'accept'),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('carries an organizer-approved window override through the parent accept path', async () => {
    const row = tournamentRepo.rows.get(tournamentId)!;
    row.ageGroups[0]!.registrationStartDate = new Date('2019-01-01');
    row.ageGroups[0]!.registrationEndDate = new Date('2020-01-01');
    const info = registrationRepo.tournamentInfo.get(tournamentId)!;
    registrationRepo.tournamentInfo.set(tournamentId, {
      ...info,
      ageGroups: [
        {
          ...info.ageGroups[0]!,
          registrationStartDate: new Date('2019-01-01'),
          registrationEndDate: new Date('2020-01-01'),
        },
      ],
    });

    const invitation = await service.invitePlayer(
      organizerId,
      tournamentId,
      childId,
      tournamentAgeGroupId,
      false,
      true,
    );
    await service.respondForChild(parentId, childId, invitation.id, 'accept');
    expect(await registrationRepo.countActive(tournamentAgeGroupId, 'player')).toBe(1);
  });
});
