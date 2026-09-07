import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { ExternalInviteService } from '../../src/modules/registrations/externalInvite.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import { tokenService } from '../../src/modules/users-auth/token.service';
import {
  FakeAudit,
  FakeExternalInviteRepo,
  FakeNotificationRepo,
  FakeOrganizerTournamentRepo,
  FakeUserRepo,
  MailboxAdapter,
} from '../helpers/fakes';

describe('ExternalInviteService', () => {
  let users: FakeUserRepo;
  let tournamentRepo: FakeOrganizerTournamentRepo;
  let invites: FakeExternalInviteRepo;
  let audit: FakeAudit;
  let mailbox: MailboxAdapter;
  let notificationRepo: FakeNotificationRepo;
  let invitePlayerCalls: {
    actorId: string;
    tournamentId: string;
    userId: string;
    tournamentAgeGroupId: string;
  }[];
  let service: ExternalInviteService;
  let organizerId: string;
  let otherOrganizerId: string;
  let adminId: string;
  let tournamentId: string;
  let tournamentAgeGroupId: string;

  beforeEach(async () => {
    users = new FakeUserRepo();
    tournamentRepo = new FakeOrganizerTournamentRepo();
    invites = new FakeExternalInviteRepo();
    audit = new FakeAudit();
    mailbox = new MailboxAdapter();
    notificationRepo = new FakeNotificationRepo();
    const authz = new AuthzService(users);
    const notifications = new NotificationService({
      notifications: notificationRepo,
      users,
      email: mailbox,
    });
    invitePlayerCalls = [];
    service = new ExternalInviteService({
      invites,
      tournaments: tournamentRepo,
      users,
      authz,
      tournamentInvitations: {
        async invitePlayer(actorId: string, tId: string, userId: string, tagId: string) {
          invitePlayerCalls.push({
            actorId,
            tournamentId: tId,
            userId,
            tournamentAgeGroupId: tagId,
          });
          return {} as never;
        },
      },
      notifications,
      email: mailbox,
      tokens: tokenService,
      audit,
      config: { webOrigin: 'http://web.test' },
    });

    const mk = async (email: string, roleIds: number[]) =>
      (await users.create({ name: email, email, passwordHash: await hash('x'), roleIds })).id;
    organizerId = await mk('organizer@example.com', [2]);
    otherOrganizerId = await mk('other-organizer@example.com', [2]);
    adminId = await mk('admin@example.com', [1]);

    const t = await tournamentRepo.create(organizerId, {
      name: 'Spring Cup',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-10'),
      capacity: null,
    });
    tournamentId = t.id;
    tournamentAgeGroupId = t.ageGroups[0]!.id;
    await tournamentRepo.updateStatus(tournamentId, 'published');
  });

  describe('send — player role, no existing account', () => {
    it('creates a pending invite and emails a signup link', async () => {
      const result = await service.send(
        organizerId,
        tournamentId,
        'player',
        'newplayer@example.com',
        tournamentAgeGroupId,
      );
      expect(result).toEqual({ outcome: 'invited_by_email' });
      expect(mailbox.externalInvites).toHaveLength(1);
      expect(mailbox.externalInvites[0]).toMatchObject({
        to: 'newplayer@example.com',
        role: 'player',
        tournament: { name: 'Spring Cup' },
      });
      const row = await invites.findPending(
        'newplayer@example.com',
        'player',
        tournamentAgeGroupId,
      );
      expect(row).toMatchObject({ email: 'newplayer@example.com', role: 'player' });
      expect(audit.actionsOf('external_invite.sent')).toHaveLength(1);
    });

    it('resends by reissuing the same row instead of erroring or duplicating', async () => {
      await service.send(
        organizerId,
        tournamentId,
        'player',
        'p@example.com',
        tournamentAgeGroupId,
      );
      const first = await invites.findPending('p@example.com', 'player', tournamentAgeGroupId);
      await service.send(
        organizerId,
        tournamentId,
        'player',
        'p@example.com',
        tournamentAgeGroupId,
      );
      const second = await invites.findPending('p@example.com', 'player', tournamentAgeGroupId);
      expect(second!.id).toBe(first!.id);
      expect(invites.rows.size).toBe(1);
      expect(mailbox.externalInvites).toHaveLength(2);
    });

    it('rejects an unpublished tournament', async () => {
      const draft = await tournamentRepo.create(organizerId, {
        name: 'Draft Cup',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-10'),
        capacity: null,
      });
      await expect(
        service.send(organizerId, draft.id, 'player', 'p@example.com', draft.ageGroups[0]!.id),
      ).rejects.toMatchObject({ code: 'TOURNAMENT_NOT_PUBLISHED' });
    });

    it('rejects an unknown bracket', async () => {
      await expect(
        service.send(organizerId, tournamentId, 'player', 'p@example.com', 'not-a-real-bracket'),
      ).rejects.toMatchObject({ code: 'AGE_GROUP_NOT_FOUND' });
    });
  });

  describe('send — player role, existing account', () => {
    it('fires the real invitation directly, no email invite created', async () => {
      const playerId = (
        await users.create({
          name: 'Existing Player',
          email: 'existing@example.com',
          passwordHash: await hash('x'),
          roleIds: [3],
        })
      ).id;
      const result = await service.send(
        organizerId,
        tournamentId,
        'player',
        'existing@example.com',
        tournamentAgeGroupId,
      );
      expect(result).toEqual({ outcome: 'invited_directly', name: 'Existing Player' });
      expect(invitePlayerCalls).toEqual([
        { actorId: organizerId, tournamentId, userId: playerId, tournamentAgeGroupId },
      ]);
      expect(mailbox.externalInvites).toHaveLength(0);
    });
  });

  describe('send — team_manager role, no existing account', () => {
    it('creates a pending invite scoped to the tournament and bracket, same as a player invite', async () => {
      const result = await service.send(
        organizerId,
        tournamentId,
        'team_manager',
        'newmanager@example.com',
        tournamentAgeGroupId,
      );
      expect(result).toEqual({ outcome: 'invited_by_email' });
      const row = await invites.findPending(
        'newmanager@example.com',
        'team_manager',
        tournamentAgeGroupId,
      );
      expect(row).toMatchObject({
        email: 'newmanager@example.com',
        role: 'team_manager',
        tournamentId,
        tournamentAgeGroupId,
      });
      expect(mailbox.externalInvites[0]).toMatchObject({
        role: 'team_manager',
        tournament: { name: 'Spring Cup' },
      });
    });

    it('rejects an unknown bracket, same as a player invite', async () => {
      await expect(
        service.send(
          organizerId,
          tournamentId,
          'team_manager',
          'newmanager@example.com',
          'not-a-real-bracket',
        ),
      ).rejects.toMatchObject({ code: 'AGE_GROUP_NOT_FOUND' });
    });
  });

  describe('send — team_manager role, existing account', () => {
    it('grants team_manager, notifies them, and queues a fulfilled invite for TeamService to consume', async () => {
      const targetId = (
        await users.create({
          name: 'Future Manager',
          email: 'future@example.com',
          passwordHash: await hash('x'),
          roleIds: [3],
        })
      ).id;
      const result = await service.send(
        organizerId,
        tournamentId,
        'team_manager',
        'future@example.com',
        tournamentAgeGroupId,
      );
      expect(result).toEqual({ outcome: 'access_granted', name: 'Future Manager' });
      const roles = await new AuthzService(users).getRoles(targetId);
      expect(roles).toContain('team_manager');
      const notifs = [...notificationRepo.rows.values()].filter((n) => n.userId === targetId);
      expect(notifs).toHaveLength(1);
      expect(notifs[0]).toMatchObject({
        type: 'team_manager_invite_pending',
        payload: { tournamentId },
      });

      const queued = await invites.findUnconsumedTeamManagerInvites(targetId);
      expect(queued).toHaveLength(1);
      expect(queued[0]).toMatchObject({ tournamentId, tournamentAgeGroupId, status: 'fulfilled' });
    });

    it('does not re-grant the role if already held, but still queues the invite and notifies — a manager can be invited to a second tournament', async () => {
      const targetId = (
        await users.create({
          name: 'Already Manager',
          email: 'already@example.com',
          passwordHash: await hash('x'),
          roleIds: [4],
        })
      ).id;
      const result = await service.send(
        organizerId,
        tournamentId,
        'team_manager',
        'already@example.com',
        tournamentAgeGroupId,
      );
      expect(result).toEqual({ outcome: 'access_granted', name: 'Already Manager' });
      const notifs = [...notificationRepo.rows.values()].filter((n) => n.userId === targetId);
      expect(notifs).toHaveLength(1);
      expect(notifs[0]).toMatchObject({ type: 'team_manager_invite_pending' });
      expect(await invites.findUnconsumedTeamManagerInvites(targetId)).toHaveLength(1);
    });

    it('does not queue a duplicate invite on a repeat send for the same tournament+bracket', async () => {
      const targetId = (
        await users.create({
          name: 'Repeat Manager',
          email: 'repeat@example.com',
          passwordHash: await hash('x'),
          roleIds: [4],
        })
      ).id;
      await service.send(
        organizerId,
        tournamentId,
        'team_manager',
        'repeat@example.com',
        tournamentAgeGroupId,
      );
      await service.send(
        organizerId,
        tournamentId,
        'team_manager',
        'repeat@example.com',
        tournamentAgeGroupId,
      );
      expect(await invites.findUnconsumedTeamManagerInvites(targetId)).toHaveLength(1);
    });
  });

  describe('authorization', () => {
    it('a non-organizer, non-admin cannot send an invite', async () => {
      await expect(
        service.send(
          otherOrganizerId,
          tournamentId,
          'team_manager',
          'x@example.com',
          tournamentAgeGroupId,
        ),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    });

    it('a platform_admin can send on behalf of any tournament', async () => {
      const result = await service.send(
        adminId,
        tournamentId,
        'team_manager',
        'x@example.com',
        tournamentAgeGroupId,
      );
      expect(result).toEqual({ outcome: 'invited_by_email' });
    });
  });

  describe('getByToken', () => {
    it('returns a preview for a valid token', async () => {
      await service.send(
        organizerId,
        tournamentId,
        'player',
        'p@example.com',
        tournamentAgeGroupId,
      );
      const { raw } = tokenServiceRawFromMailbox(mailbox);
      const preview = await service.getByToken(raw);
      expect(preview).toMatchObject({
        email: 'p@example.com',
        role: 'player',
        organizerName: 'organizer@example.com',
      });
    });

    it('rejects an invalid token', async () => {
      await expect(service.getByToken('garbage')).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
    });

    it('rejects an expired token', async () => {
      await service.send(
        organizerId,
        tournamentId,
        'player',
        'p@example.com',
        tournamentAgeGroupId,
      );
      const { raw } = tokenServiceRawFromMailbox(mailbox);
      const row = await invites.findByTokenHash(tokenService.hashToken(raw));
      row!.expiresAt = new Date(Date.now() - 1000);
      await expect(service.getByToken(raw)).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    });

    it('rejects an already-used token', async () => {
      await service.send(
        organizerId,
        tournamentId,
        'player',
        'p@example.com',
        tournamentAgeGroupId,
      );
      const { raw } = tokenServiceRawFromMailbox(mailbox);
      await invites.claim(tokenService.hashToken(raw));
      await expect(service.getByToken(raw)).rejects.toMatchObject({ code: 'TOKEN_ALREADY_USED' });
    });
  });

  describe('listForTournament', () => {
    it('lists invites of both roles sent from this tournament', async () => {
      await service.send(
        organizerId,
        tournamentId,
        'player',
        'p1@example.com',
        tournamentAgeGroupId,
      );
      await service.send(
        organizerId,
        tournamentId,
        'team_manager',
        'm1@example.com',
        tournamentAgeGroupId,
      );
      const list = await service.listForTournament(organizerId, tournamentId);
      expect(list).toHaveLength(2);
      expect(list.map((i) => i.email).sort()).toEqual(['m1@example.com', 'p1@example.com']);
    });

    it('a non-organizer cannot list', async () => {
      await expect(service.listForTournament(otherOrganizerId, tournamentId)).rejects.toMatchObject(
        { code: 'NOT_ALLOWED' },
      );
    });
  });
});

function tokenServiceRawFromMailbox(mailbox: MailboxAdapter): { raw: string } {
  const last = mailbox.externalInvites[mailbox.externalInvites.length - 1]!;
  const raw = new URL(last.signupUrl).searchParams.get('inviteToken');
  if (!raw) throw new Error(`no inviteToken in url: ${last.signupUrl}`);
  return { raw };
}
