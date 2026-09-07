import { hash } from '@node-rs/argon2';
import type { TeamDto } from '@nforce/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import type { ParentService } from '../../src/modules/parents/parent.service';
import { RegistrationService } from '../../src/modules/registrations/registration.service';
import { TournamentInvitationService } from '../../src/modules/registrations/tournamentInvitation.service';
import { TeamService } from '../../src/modules/teams/team.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import {
  FakeAudit,
  FakeExternalInviteRepo,
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

describe('TeamService', () => {
  let users: FakeUserRepo;
  let teamRepo: FakeTeamRepo;
  let tournamentRepo: FakeOrganizerTournamentRepo;
  let registrationRepo: FakeRegistrationRepo;
  let registrationService: RegistrationService;
  let notificationRepo: FakeNotificationRepo;
  let audit: FakeAudit;
  let service: TeamService;
  let externalInvites: FakeExternalInviteRepo;
  let tournamentInvitations: TournamentInvitationService;
  let parents: ParentService;
  let managerId: string;
  let otherManagerId: string;
  let playerId: string;
  let playerEmail: string;
  let parentId: string;

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
    const authz = new AuthzService(users);
    registrationService = new RegistrationService({
      registrations: registrationRepo,
      users,
      teams: teamRepo,
      tournaments: tournamentRepo,
      notifications,
      authz,
      audit,
      tx: fakeTx,
      parents,
      playerProfile: { getProfile: () => Promise.reject(new Error('not used in this test')) },
    });
    externalInvites = new FakeExternalInviteRepo();
    tournamentInvitations = new TournamentInvitationService({
      invitations: new FakeTournamentInvitationRepo({
        tournaments: new Map(),
        teams: teamRepo,
        users,
      }),
      teams: teamRepo,
      users,
      tournaments: tournamentRepo,
      registrations: registrationService,
      notifications,
      authz,
      parents,
    });
    service = new TeamService({
      teams: teamRepo,
      users,
      notifications,
      authz,
      audit,
      tx: fakeTx,
      parents,
      registrations: registrationService,
      tournaments: tournamentRepo,
      externalInvites,
      tournamentInvitations,
    });

    const mk = async (email: string, roleIds: number[]) =>
      (await users.create({ name: email, email, passwordHash: await hash('x'), roleIds })).id;
    managerId = await mk('manager@example.com', [4]);
    otherManagerId = await mk('other-manager@example.com', [4]);
    playerId = await mk('player@example.com', [3]);
    playerEmail = 'player@example.com';
    parentId = await mk('parent@example.com', [7]);
  });

  it('only a team manager can create a team', async () => {
    await expect(service.create(playerId, { name: 'Falcons' })).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
    const team = await service.create(managerId, { name: 'Falcons' });
    expect(team.roster).toHaveLength(0);
  });

  it('blocks a manager from creating (or renaming into) a duplicate of their own team name — case/whitespace-insensitive', async () => {
    await service.create(managerId, { name: 'Falcons' });
    await expect(service.create(managerId, { name: '  falcons  ' })).rejects.toMatchObject({
      code: 'DUPLICATE_TEAM_NAME',
    });
    const theirs = await service.create(otherManagerId, { name: 'Falcons' });
    expect(theirs.name).toBe('Falcons');

    const second = await service.create(managerId, { name: 'Eagles' });
    await expect(service.update(managerId, second.id, { name: 'FALCONS' })).rejects.toMatchObject({
      code: 'DUPLICATE_TEAM_NAME',
    });
    const unchanged = await service.update(managerId, second.id, { name: 'Eagles' });
    expect(unchanged.name).toBe('Eagles');
  });

  describe('auto-invite from a pending team_manager external invite', () => {
    const DAY = 86_400_000;

    async function publishedTournament(organizerId: string) {
      const t = await tournamentRepo.create(organizerId, {
        name: 'Founders Cup',
        startDate: new Date(Date.now() + DAY),
        endDate: new Date(Date.now() + 10 * DAY),
        capacity: null,
        ageGroups: [
          {
            ageGroupId: 'age-open',
            bornAfter: null,
            bornBefore: null,
            genderCategory: 'mixed',
            registrationStartDate: new Date(Date.now() - 30 * DAY),
            registrationEndDate: new Date(Date.now() + 30 * DAY),
            capacity: null,
            format: 'T20',
            entryFee: null,
            oversPerInnings: null,
          },
        ],
      });
      await tournamentRepo.updateStatus(t.id, 'published');
      return t;
    }

    it("fires a real tournament invitation for a manager's first team, from a fulfilled team_manager external invite", async () => {
      const t = await publishedTournament(otherManagerId);
      await externalInvites.create({
        email: 'manager@example.com',
        role: 'team_manager',
        tournamentId: t.id,
        tournamentAgeGroupId: t.ageGroups[0]!.id,
        invitedByOrganizerId: otherManagerId,
        tokenHash: 'hash-1',
        expiresAt: new Date(Date.now() + DAY),
        status: 'fulfilled',
        claimedByUserId: managerId,
      });

      const team = await service.create(managerId, { name: 'Falcons' });

      const invitations = await tournamentInvitations.listForTeam(managerId, team.id);
      expect(invitations).toHaveLength(1);
      expect(invitations[0]).toMatchObject({
        tournamentId: t.id,
        entityType: 'team',
        entityId: team.id,
        status: 'invited',
      });
      expect(await externalInvites.findUnconsumedTeamManagerInvites(managerId)).toHaveLength(0);
      const second = await service.create(managerId, { name: 'Eagles' });
      expect(await tournamentInvitations.listForTeam(managerId, second.id)).toHaveLength(0);
    });

    it('never fails team creation when the auto-invite itself fails (e.g. the tournament closed in the meantime)', async () => {
      const t = await publishedTournament(otherManagerId);
      await externalInvites.create({
        email: 'manager@example.com',
        role: 'team_manager',
        tournamentId: t.id,
        tournamentAgeGroupId: t.ageGroups[0]!.id,
        invitedByOrganizerId: otherManagerId,
        tokenHash: 'hash-2',
        expiresAt: new Date(Date.now() + DAY),
        status: 'fulfilled',
        claimedByUserId: managerId,
      });
      await tournamentRepo.updateStatus(t.id, 'closed');

      const team = await service.create(managerId, { name: 'Falcons' });
      expect(team.name).toBe('Falcons');
      expect(await tournamentInvitations.listForTeam(managerId, team.id)).toHaveLength(0);
      expect(await externalInvites.findUnconsumedTeamManagerInvites(managerId)).toHaveLength(0);
    });

    it('leaves an unrelated player-role external invite alone', async () => {
      const team = await service.create(playerId, { name: 'Should not happen' }).catch(() => null);
      expect(team).toBeNull();

      const t = await publishedTournament(otherManagerId);
      await externalInvites.create({
        email: playerEmail,
        role: 'player',
        tournamentId: t.id,
        tournamentAgeGroupId: t.ageGroups[0]!.id,
        invitedByOrganizerId: otherManagerId,
        tokenHash: 'hash-3',
        expiresAt: new Date(Date.now() + DAY),
        status: 'fulfilled',
        claimedByUserId: managerId,
      });
      const created = await service.create(managerId, { name: 'Falcons' });
      expect(await tournamentInvitations.listForTeam(managerId, created.id)).toHaveLength(0);
    });
  });

  it('audits an actual rename with the old and new name, but not a no-op save', async () => {
    const team = await service.create(managerId, { name: 'Falcons' });

    await service.update(managerId, team.id, { name: 'Falcons' });
    expect(audit.actionsOf('team.renamed')).toHaveLength(0);

    await service.update(managerId, team.id, { name: 'Kestrels' });
    const entries = audit.actionsOf('team.renamed');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: managerId,
      entityType: 'team',
      entityId: team.id,
      meta: { name: 'Kestrels', previousName: 'Falcons' },
    });
  });

  it('blocks a non-owner manager from editing or inviting', async () => {
    const team = await service.create(managerId, { name: 'Falcons' });
    await expect(
      service.update(otherManagerId, team.id, { name: 'Hijacked' }),
    ).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
    await expect(
      service.inviteMember(otherManagerId, team.id, { email: playerEmail, roleInTeam: 'player' }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('invites a player by email as "invited", never counted until accepted', async () => {
    const team = await service.create(managerId, { name: 'Falcons' });
    const updated = await service.inviteMember(managerId, team.id, {
      email: playerEmail,
      roleInTeam: 'captain',
    });
    expect(updated.roster).toHaveLength(1);
    expect(updated.roster[0]).toMatchObject({
      userId: playerId,
      status: 'invited',
      roleInTeam: 'captain',
    });
  });

  it('rejects inviting an email with no account, and a duplicate invite', async () => {
    const team = await service.create(managerId, { name: 'Falcons' });
    await expect(
      service.inviteMember(managerId, team.id, {
        email: 'ghost@example.com',
        roleInTeam: 'player',
      }),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });

    await service.inviteMember(managerId, team.id, { email: playerEmail, roleInTeam: 'player' });
    await expect(
      service.inviteMember(managerId, team.id, { email: playerEmail, roleInTeam: 'player' }),
    ).rejects.toMatchObject({ code: 'ALREADY_ON_ROSTER' });
  });

  it('the invited player can accept or decline; shows up in myInvitations until then', async () => {
    const team = await service.create(managerId, { name: 'Falcons' });
    await service.inviteMember(managerId, team.id, { email: playerEmail, roleInTeam: 'player' });

    expect(await service.myInvitations(playerId)).toHaveLength(1);

    await service.respondToInvite(playerId, team.id, 'accept');
    expect(await service.myInvitations(playerId)).toHaveLength(0);
    const reloaded = await service.getOwned(managerId, team.id);
    expect(reloaded.roster[0]!.status).toBe('accepted');

    const managerNotifs = [...notificationRepo.rows.values()].filter((n) => n.userId === managerId);
    expect(managerNotifs).toHaveLength(1);
    expect(managerNotifs[0]!.body).toContain('accepted');
    expect(managerNotifs[0]!.body).toContain('Falcons');
  });

  it('accepting a roster invite auto-withdraws a redundant individual registration for a tournament the team already holds', async () => {
    const t = await tournamentRepo.create(managerId, {
      name: 'Cup',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-10'),
      capacity: null,
    });
    const team = await service.create(managerId, { name: 'Falcons' });
    const teamReg = await registrationRepo.create(t.id, { teamId: team.id });
    const playerReg = await registrationRepo.create(t.id, { userId: playerId });

    await service.inviteMember(managerId, team.id, { email: playerEmail, roleInTeam: 'player' });
    await service.respondToInvite(playerId, team.id, 'accept');

    expect((await registrationRepo.findById(playerReg.id))!.status).toBe('withdrawn');
    expect((await registrationRepo.findById(teamReg.id))!.status).toBe('active');

    const auditEntries = audit.actionsOf('registration.withdrawn');
    expect(auditEntries).toHaveLength(1);
    expect(auditEntries[0]).toMatchObject({
      actorUserId: playerId,
      entityType: 'user',
      entityId: playerId,
      meta: { tournamentId: t.id, teamId: team.id, autoWithdrawn: true },
    });

    const playerNotifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === playerId && n.type === 'registration_withdrawn',
    );
    expect(playerNotifs).toHaveLength(1);
  });

  it('does not touch an individual registration for a DIFFERENT tournament the team is not registered for', async () => {
    const t1 = await tournamentRepo.create(managerId, {
      name: 'Cup 1',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-10'),
      capacity: null,
    });
    const t2 = await tournamentRepo.create(managerId, {
      name: 'Cup 2',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-10'),
      capacity: null,
    });
    const team = await service.create(managerId, { name: 'Falcons' });
    await registrationRepo.create(t1.id, {
      teamId: team.id,
      tournamentAgeGroupId: t1.ageGroups[0]!.id,
    });
    const playerReg = await registrationRepo.create(t2.id, {
      userId: playerId,
      tournamentAgeGroupId: t2.ageGroups[0]!.id,
    });

    await service.inviteMember(managerId, team.id, { email: playerEmail, roleInTeam: 'player' });
    await service.respondToInvite(playerId, team.id, 'accept');

    expect((await registrationRepo.findById(playerReg.id))!.status).toBe('active');
  });

  it('lets the manager re-invite a player who previously declined — no permanent lockout', async () => {
    const team = await service.create(managerId, { name: 'Falcons' });
    await service.inviteMember(managerId, team.id, { email: playerEmail, roleInTeam: 'player' });
    await service.respondToInvite(playerId, team.id, 'decline');
    expect((await service.getOwned(managerId, team.id)).roster[0]!.status).toBe('declined');

    const updated = await service.inviteMember(managerId, team.id, {
      email: playerEmail,
      roleInTeam: 'player',
    });
    expect(updated.roster[0]!.status).toBe('invited');
    expect(await service.myInvitations(playerId)).toHaveLength(1);
  });

  it('rejects responding to a non-existent invitation', async () => {
    const team = await service.create(managerId, { name: 'Falcons' });
    await expect(service.respondToInvite(playerId, team.id, 'accept')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('removes a roster member, tells the removed player, and writes an audit entry', async () => {
    const team = await service.create(managerId, { name: 'Falcons' });
    await service.inviteMember(managerId, team.id, { email: playerEmail, roleInTeam: 'player' });
    await service.removeMember(managerId, team.id, playerId, '127.0.0.1');
    const reloaded = await service.getOwned(managerId, team.id);
    expect(reloaded.roster).toHaveLength(0);

    const playerNotifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === playerId && n.type === 'squad_removed',
    );
    expect(playerNotifs).toHaveLength(1);
    expect(playerNotifs[0]!.body).toContain('Falcons');

    const entries = audit.actionsOf('team.member_removed');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: managerId,
      entityType: 'user',
      entityId: playerId,
      meta: { teamId: team.id },
      ip: '127.0.0.1',
    });
  });

  describe("an organizer managing a registered team's roster", () => {
    let organizerId: string;
    let otherOrganizerId: string;

    beforeEach(async () => {
      organizerId = (
        await users.create({
          name: 'organizer@example.com',
          email: 'organizer@example.com',
          passwordHash: await hash('x'),
          roleIds: [2],
        })
      ).id;
      otherOrganizerId = (
        await users.create({
          name: 'other-organizer@example.com',
          email: 'other-organizer@example.com',
          passwordHash: await hash('x'),
          roleIds: [2],
        })
      ).id;
    });

    it('lets the organizer of a tournament the team is actively registered in add and remove roster members', async () => {
      const team = await service.create(managerId, { name: 'Falcons' });
      registrationRepo.tournamentOrganizers.set('tournament-1', organizerId);
      await registrationRepo.create('tournament-1', { teamId: team.id });

      const updated = await service.inviteMember(organizerId, team.id, {
        email: playerEmail,
        roleInTeam: 'player',
      });
      expect(updated.roster).toMatchObject([{ userId: playerId, status: 'invited' }]);

      await service.removeMember(organizerId, team.id, playerId);
      const reloaded = await service.getOwned(managerId, team.id);
      expect(reloaded.roster).toHaveLength(0);
    });

    it("blocks an organizer whose OWN tournament this team isn't registered in", async () => {
      const team = await service.create(managerId, { name: 'Falcons' });
      registrationRepo.tournamentOrganizers.set('tournament-1', organizerId);
      await registrationRepo.create('tournament-1', { teamId: team.id });

      await expect(
        service.inviteMember(otherOrganizerId, team.id, {
          email: playerEmail,
          roleInTeam: 'player',
        }),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    });

    it('blocks the same organizer once the team withdraws (registration no longer active)', async () => {
      const team = await service.create(managerId, { name: 'Falcons' });
      registrationRepo.tournamentOrganizers.set('tournament-1', organizerId);
      const reg = await registrationRepo.create('tournament-1', { teamId: team.id });
      await registrationRepo.withdraw(reg.id);

      await expect(
        service.inviteMember(organizerId, team.id, { email: playerEmail, roleInTeam: 'player' }),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    });

    it("doesn't extend to unrelated team actions like renaming", async () => {
      const team = await service.create(managerId, { name: 'Falcons' });
      registrationRepo.tournamentOrganizers.set('tournament-1', organizerId);
      await registrationRepo.create('tournament-1', { teamId: team.id });

      await expect(service.update(organizerId, team.id, { name: 'Renamed' })).rejects.toMatchObject(
        { code: 'NOT_ALLOWED' },
      );
    });
  });

  it('only a player can request to join, lands as "requested" until the manager responds', async () => {
    const team = await service.create(managerId, { name: 'Falcons' });
    await expect(
      service.requestToJoin(managerId, team.id, { roleInTeam: 'player' }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });

    await service.requestToJoin(playerId, team.id, { roleInTeam: 'player' });
    const reloaded = await service.getOwned(managerId, team.id);
    expect(reloaded.roster).toHaveLength(1);
    expect(reloaded.roster[0]).toMatchObject({ userId: playerId, status: 'requested' });
  });

  it('rejects a duplicate join request the same way as a duplicate invite', async () => {
    const team = await service.create(managerId, { name: 'Falcons' });
    await service.requestToJoin(playerId, team.id, { roleInTeam: 'player' });
    await expect(
      service.requestToJoin(playerId, team.id, { roleInTeam: 'player' }),
    ).rejects.toMatchObject({ code: 'ALREADY_ON_ROSTER' });
  });

  it('lets a player re-request to join after a previous request was declined', async () => {
    const team = await service.create(managerId, { name: 'Falcons' });
    await service.requestToJoin(playerId, team.id, { roleInTeam: 'player' });
    await service.respondToJoinRequest(managerId, team.id, playerId, 'decline');
    expect((await service.getOwned(managerId, team.id)).roster[0]!.status).toBe('declined');

    await service.requestToJoin(playerId, team.id, { roleInTeam: 'player' });
    const reloaded = await service.getOwned(managerId, team.id);
    expect(reloaded.roster[0]).toMatchObject({ userId: playerId, status: 'requested' });
  });

  it("only the team's manager (or admin) can respond to a join request", async () => {
    const team = await service.create(managerId, { name: 'Falcons' });
    await service.requestToJoin(playerId, team.id, { roleInTeam: 'player' });
    await expect(
      service.respondToJoinRequest(otherManagerId, team.id, playerId, 'accept'),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('accepting a join request converts it to "accepted"; declining leaves it "declined"', async () => {
    const team = await service.create(managerId, { name: 'Falcons' });
    await service.requestToJoin(playerId, team.id, { roleInTeam: 'player' });
    await service.respondToJoinRequest(managerId, team.id, playerId, 'accept');
    const reloaded = await service.getOwned(managerId, team.id);
    expect(reloaded.roster[0]!.status).toBe('accepted');
    expect(audit.actionsOf('team.join_request_declined')).toHaveLength(0);
  });

  it('declining a join request writes an audit entry naming the declined player', async () => {
    const team = await service.create(managerId, { name: 'Falcons' });
    await service.requestToJoin(playerId, team.id, { roleInTeam: 'player' });
    await service.respondToJoinRequest(managerId, team.id, playerId, 'decline', '127.0.0.1');
    const reloaded = await service.getOwned(managerId, team.id);
    expect(reloaded.roster[0]!.status).toBe('declined');

    const entries = audit.actionsOf('team.join_request_declined');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: managerId,
      entityType: 'user',
      entityId: playerId,
      meta: { teamId: team.id },
      ip: '127.0.0.1',
    });
  });

  it('rejects responding to a join request that does not exist, or is not pending', async () => {
    const team = await service.create(managerId, { name: 'Falcons' });
    await expect(
      service.respondToJoinRequest(managerId, team.id, playerId, 'accept'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await service.inviteMember(managerId, team.id, { email: playerEmail, roleInTeam: 'player' });
    await expect(
      service.respondToJoinRequest(managerId, team.id, playerId, 'accept'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('inviteMember resolves by userId as well as by email — the recruit-from-tournament path', async () => {
    const team = await service.create(managerId, { name: 'Falcons' });
    const updated = await service.inviteMember(managerId, team.id, {
      userId: playerId,
      roleInTeam: 'player',
    });
    expect(updated.roster).toHaveLength(1);
    expect(updated.roster[0]).toMatchObject({ userId: playerId, status: 'invited' });
  });

  it('inviteMember by userId reaches a managed child (no email of their own to type)', async () => {
    const team = await service.create(managerId, { name: 'Falcons' });
    const child = await parents.addChild(parentId, { name: 'Kid', dateOfBirth: '2015-01-01' });
    const updated = await service.inviteMember(managerId, team.id, {
      userId: child.id,
      roleInTeam: 'player',
    });
    expect(updated.roster[0]).toMatchObject({ userId: child.id, status: 'invited' });

    const parentNotifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === parentId && n.type === 'squad_invitation',
    );
    expect(parentNotifs).toHaveLength(1);
    expect(parentNotifs[0]!.payload).toMatchObject({ childId: child.id, childName: 'Kid' });
  });

  describe('respondToInviteForChild (parent on behalf of a managed child)', () => {
    it('accepts on the child’s behalf, notifies the manager, and audits it', async () => {
      const team = await service.create(managerId, { name: 'Falcons' });
      const child = await parents.addChild(parentId, { name: 'Kid', dateOfBirth: '2015-01-01' });
      await service.inviteMember(managerId, team.id, { userId: child.id, roleInTeam: 'player' });

      await service.respondToInviteForChild(parentId, child.id, team.id, 'accept', '127.0.0.1');
      const reloaded = await service.getOwned(managerId, team.id);
      expect(reloaded.roster[0]!.status).toBe('accepted');

      const managerNotifs = [...notificationRepo.rows.values()].filter(
        (n) => n.userId === managerId && n.type === 'squad_invitation_response',
      );
      expect(managerNotifs).toHaveLength(1);
      expect(managerNotifs[0]!.body).toContain('Kid');
      expect(managerNotifs[0]!.payload).toMatchObject({
        teamId: team.id,
        userId: child.id,
        respondedByParentId: parentId,
      });

      const entries = audit.actionsOf('team.invitation_responded');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        actorUserId: parentId,
        entityType: 'user',
        entityId: child.id,
        meta: { teamId: team.id, decision: 'accept', onBehalfOf: child.id },
        ip: '127.0.0.1',
      });
    });

    it('declining works the same way', async () => {
      const team = await service.create(managerId, { name: 'Falcons' });
      const child = await parents.addChild(parentId, { name: 'Kid', dateOfBirth: '2015-01-01' });
      await service.inviteMember(managerId, team.id, { userId: child.id, roleInTeam: 'player' });

      await service.respondToInviteForChild(parentId, child.id, team.id, 'decline');
      const reloaded = await service.getOwned(managerId, team.id);
      expect(reloaded.roster[0]!.status).toBe('declined');
    });

    it('rejects a parent who does not manage the child', async () => {
      const team = await service.create(managerId, { name: 'Falcons' });
      const child = await parents.addChild(parentId, { name: 'Kid', dateOfBirth: '2015-01-01' });
      await service.inviteMember(managerId, team.id, { userId: child.id, roleInTeam: 'player' });

      const otherParentId = await (async () =>
        (
          await users.create({
            name: 'other-parent',
            email: 'other-parent@example.com',
            passwordHash: 'x',
            roleIds: [7],
          })
        ).id)();
      await expect(
        service.respondToInviteForChild(otherParentId, child.id, team.id, 'accept'),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    });

    it('rejects when there is no pending invitation for that child/team', async () => {
      const team = await service.create(managerId, { name: 'Falcons' });
      const child = await parents.addChild(parentId, { name: 'Kid', dateOfBirth: '2015-01-01' });
      await expect(
        service.respondToInviteForChild(parentId, child.id, team.id, 'accept'),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('createDraftTeam / listDraftTeams', () => {
    let organizerId: string;
    let draftTournamentId: string;
    let draftAgeGroupId: string;
    let prebuiltTournamentId: string;
    let prebuiltAgeGroupId: string;

    beforeEach(async () => {
      organizerId = await (async () =>
        (
          await users.create({
            name: 'organizer',
            email: 'organizer@example.com',
            passwordHash: await hash('x'),
            roleIds: [2],
          })
        ).id)();

      const draft = await tournamentRepo.create(organizerId, {
        name: 'Draft Cup',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-10'),
        capacity: 30,
        teamSelectionMode: 'draft_based',
        ageGroups: [
          {
            ageGroupId: 'age-u13',
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
      draftTournamentId = draft.id;
      draftAgeGroupId = draft.ageGroups[0]!.id;
      await tournamentRepo.updateStatus(draftTournamentId, 'published');

      const prebuilt = await tournamentRepo.create(organizerId, {
        name: 'Rosters Cup',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-10'),
        capacity: 30,
        teamSelectionMode: 'prebuilt_rosters',
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
      prebuiltTournamentId = prebuilt.id;
      prebuiltAgeGroupId = prebuilt.ageGroups[0]!.id;
      await tournamentRepo.updateStatus(prebuiltTournamentId, 'published');
    });

    it("creates a draft team under the organizer's own management, listed by bracket", async () => {
      expect(await service.listDraftTeams(organizerId, draftTournamentId, draftAgeGroupId)).toEqual(
        [],
      );

      const teamA = await service.createDraftTeam(
        organizerId,
        draftTournamentId,
        draftAgeGroupId,
        'U-13 Team A',
      );
      expect(teamA.managerId).toBe(organizerId);
      expect(teamA.roster).toHaveLength(0);

      const teamB = await service.createDraftTeam(
        organizerId,
        draftTournamentId,
        draftAgeGroupId,
        'U-13 Team B',
      );

      const listed = await service.listDraftTeams(organizerId, draftTournamentId, draftAgeGroupId);
      expect(listed.map((t) => t.id).sort()).toEqual([teamA.id, teamB.id].sort());

      const renamed = await service.update(organizerId, teamA.id, { name: 'U-13 Alphas' });
      expect(renamed.name).toBe('U-13 Alphas');
    });

    it('still blocks two draft teams sharing a name within the SAME bracket', async () => {
      await service.createDraftTeam(organizerId, draftTournamentId, draftAgeGroupId, 'Team A');
      await expect(
        service.createDraftTeam(organizerId, draftTournamentId, draftAgeGroupId, '  team a  '),
      ).rejects.toMatchObject({ code: 'DUPLICATE_TEAM_NAME' });
    });

    it('lets a generic draft-team name (e.g. "Team A") be reused across a different tournament — draft teams are scoped per bracket, not globally per organizer', async () => {
      await service.createDraftTeam(organizerId, draftTournamentId, draftAgeGroupId, 'Team A');

      const otherDraft = await tournamentRepo.create(organizerId, {
        name: 'Another Draft Cup',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-10'),
        capacity: 30,
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
      await tournamentRepo.updateStatus(otherDraft.id, 'published');

      const reused = await service.createDraftTeam(
        organizerId,
        otherDraft.id,
        otherDraft.ageGroups[0]!.id,
        'Team A',
      );
      expect(reused.name).toBe('Team A');
    });

    it('only the organizer (or admin) may create or list draft teams for their tournament', async () => {
      await expect(
        service.createDraftTeam(managerId, draftTournamentId, draftAgeGroupId, 'Sneaky Team'),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
      await expect(
        service.listDraftTeams(managerId, draftTournamentId, draftAgeGroupId),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    });

    it('refuses draft teams for a prebuilt_rosters tournament', async () => {
      await expect(
        service.createDraftTeam(organizerId, prebuiltTournamentId, prebuiltAgeGroupId, 'Nope'),
      ).rejects.toMatchObject({ code: 'NOT_DRAFT_BASED' });
    });

    it("rejects an age group that isn't actually one of this tournament's own brackets", async () => {
      await expect(
        service.createDraftTeam(organizerId, draftTournamentId, prebuiltAgeGroupId, 'Nope'),
      ).rejects.toMatchObject({ code: 'AGE_GROUP_NOT_FOUND' });
    });

    describe('assignDraftPlayer', () => {
      let teamA: TeamDto;
      let teamB: TeamDto;

      beforeEach(async () => {
        teamA = await service.createDraftTeam(organizerId, draftTournamentId, draftAgeGroupId, 'A');
        teamB = await service.createDraftTeam(organizerId, draftTournamentId, draftAgeGroupId, 'B');
      });

      it('lands the player as accepted immediately — no invite/accept round trip', async () => {
        const updated = await service.assignDraftPlayer(organizerId, teamA.id, playerId);
        expect(updated.roster).toEqual([
          expect.objectContaining({ userId: playerId, status: 'accepted' }),
        ]);
      });

      it('notifies the player which team they were assigned to', async () => {
        await service.assignDraftPlayer(organizerId, teamA.id, playerId);
        const playerNotifs = [...notificationRepo.rows.values()].filter(
          (n) => n.userId === playerId && n.type === 'squad_assigned',
        );
        expect(playerNotifs).toHaveLength(1);
        expect(playerNotifs[0]!.body).toContain('A');
      });

      it('moves the player off the other draft team in the same bracket when assigned to this one', async () => {
        await service.assignDraftPlayer(organizerId, teamA.id, playerId);
        const moved = await service.assignDraftPlayer(organizerId, teamB.id, playerId);
        expect(moved.roster.map((r) => r.userId)).toEqual([playerId]);
        const refreshedA = await service.getOwned(organizerId, teamA.id);
        expect(refreshedA.roster).toHaveLength(0);
      });

      it('is a no-op, not an error, when re-assigning to the team the player is already on', async () => {
        await service.assignDraftPlayer(organizerId, teamA.id, playerId);
        const again = await service.assignDraftPlayer(organizerId, teamA.id, playerId);
        expect(again.roster).toHaveLength(1);
      });

      it('refuses to assign players onto a normal (non-draft) team', async () => {
        const normal = await service.create(managerId, { name: 'Normal Team' });
        await expect(
          service.assignDraftPlayer(managerId, normal.id, playerId),
        ).rejects.toMatchObject({ code: 'NOT_DRAFT_TEAM' });
      });

      it('only the organizer who manages the draft team may assign players onto it', async () => {
        await expect(
          service.assignDraftPlayer(managerId, teamA.id, playerId),
        ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
      });
    });
  });
});
