import type { OpenFixtureDto, UmpireScheduleEntryDto } from '@nforce/shared';
import { Prisma } from '@prisma/client';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import type { TxRunner } from '../../lib/db';
import type { AuditEntry, AuditPort } from '../audit/audit.service';
import type { NotificationService } from '../notifications/notification.service';
import type { OrganizerTournamentRepoPort } from '../tournaments/organizerTournament.repo';
import type { AuthzService } from '../users-auth/authz.service';
import type { UserDirectoryEntry, UserRepoPort } from '../users-auth/user.repo';
import type { FixtureRepoPort } from './fixture.repo';
import { slotsOverlap } from './overlap';
import type { UmpireAssignmentRepoPort } from './umpireAssignment.repo';

export interface UmpireServiceDeps {
  fixtures: Pick<FixtureRepoPort, 'findById' | 'listOpenForUmpire'>;
  assignments: UmpireAssignmentRepoPort;
  tournaments: Pick<OrganizerTournamentRepoPort, 'findById'>;
  users: Pick<UserRepoPort, 'findById' | 'listDirectoryByRole'>;
  notifications: NotificationService;
  authz: AuthzService;
  audit: AuditPort;
  tx: TxRunner;
}

export class UmpireService {
  constructor(private readonly deps: UmpireServiceDeps) {}

  async listDirectory(actorId: string): Promise<UserDirectoryEntry[]> {
    await this.deps.authz.assertRole(actorId, 'organizer', 'platform_admin');
    return this.deps.users.listDirectoryByRole('umpire');
  }

  async listOpen(umpireId: string): Promise<OpenFixtureDto[]> {
    await this.deps.authz.assertRole(umpireId, 'umpire');
    const rows = await this.deps.fixtures.listOpenForUmpire(umpireId);
    return rows.map((f) => ({
      id: f.id,
      tournamentId: f.tournamentId,
      tournamentName: f.tournamentName,
      homeTeam: f.homeTeamName,
      awayTeam: f.awayTeamName,
      ground: f.groundName,
      startsAt: f.startsAt.toISOString(),
      durationMinutes: f.durationMinutes,
      myStatus: f.myStatus,
    }));
  }

  async schedule(umpireId: string): Promise<UmpireScheduleEntryDto[]> {
    await this.deps.authz.assertRole(umpireId, 'umpire');
    const rows = await this.deps.assignments.scheduleFor(umpireId);
    return rows.map((r) => ({
      fixtureId: r.fixtureId,
      tournamentName: r.tournamentName,
      homeTeam: r.homeTeamName,
      awayTeam: r.awayTeamName,
      ground: r.groundName,
      startsAt: r.startsAt.toISOString(),
      durationMinutes: r.durationMinutes,
    }));
  }

  async apply(umpireId: string, fixtureId: string): Promise<void> {
    await this.deps.authz.assertRole(umpireId, 'umpire');
    const actor = await this.deps.users.findById(umpireId);
    if (!actor?.verified) {
      throw new ForbiddenError(
        'Verify your email before applying to officiate.',
        'EMAIL_NOT_VERIFIED',
      );
    }
    const fixture = await this.deps.fixtures.findById(fixtureId);
    if (!fixture) throw new NotFoundError('Fixture not found');
    const existing = await this.deps.assignments.find(fixtureId, umpireId);
    if (existing?.status === 'accepted') {
      throw new ConflictError('You are already assigned to this match.', 'ALREADY_ASSIGNED');
    }
    await this.deps.assignments.upsertStatus(fixtureId, umpireId, 'applied');

    const tournament = await this.deps.tournaments.findById(fixture.tournamentId);
    if (tournament) {
      await this.deps.notifications.notify({
        userId: tournament.organizerId,
        type: 'umpire_applied',
        title: 'Umpire application',
        body: `${actor.name} applied to officiate ${fixture.homeTeamName} vs ${fixture.awayTeamName}.`,
        payload: { fixtureId, tournamentId: fixture.tournamentId },
      });
    }
  }

  async respondToInvite(
    umpireId: string,
    fixtureId: string,
    decision: 'accept' | 'decline',
  ): Promise<void> {
    await this.deps.authz.assertRole(umpireId, 'umpire');
    const assignment = await this.deps.assignments.find(fixtureId, umpireId);
    if (!assignment || assignment.status !== 'invited') {
      throw new NotFoundError('No pending invitation for this match');
    }
    const fixture = await this.deps.fixtures.findById(fixtureId);
    const tournament = fixture ? await this.deps.tournaments.findById(fixture.tournamentId) : null;

    if (decision === 'decline') {
      await this.deps.assignments.setStatus(fixtureId, umpireId, 'declined');
      if (fixture && tournament) {
        await this.deps.notifications.notify({
          userId: tournament.organizerId,
          type: 'umpire_declined',
          title: `Umpire declined: ${fixture.homeTeamName} vs ${fixture.awayTeamName}`,
          body: `An umpire declined to officiate ${fixture.homeTeamName} vs ${fixture.awayTeamName} (${tournament.name}).`,
          payload: { fixtureId, tournamentId: fixture.tournamentId },
        });
      }
      return;
    }

    await this.confirmAccepted(umpireId, fixtureId);
    if (fixture && tournament) {
      const umpire = await this.deps.users.findById(umpireId);
      await this.deps.notifications.notify({
        userId: tournament.organizerId,
        type: 'umpire_accepted',
        title: `Umpire accepted: ${fixture.homeTeamName} vs ${fixture.awayTeamName}`,
        body: `${umpire?.name ?? 'The umpire'} accepted the assignment to officiate ${fixture.homeTeamName} vs ${fixture.awayTeamName} (${tournament.name}).`,
        payload: { fixtureId, tournamentId: fixture.tournamentId },
      });
    }
  }

  async assign(
    organizerId: string,
    fixtureId: string,
    umpireId: string,
    ip?: string,
  ): Promise<void> {
    await this.deps.authz.assertRole(organizerId, 'organizer');
    const fixture = await this.deps.fixtures.findById(fixtureId);
    if (!fixture) throw new NotFoundError('Fixture not found');
    const tournament = await this.deps.tournaments.findById(fixture.tournamentId);
    if (!tournament) throw new NotFoundError('Tournament not found');
    if (tournament.organizerId !== organizerId) {
      const roles = await this.deps.authz.getRoles(organizerId);
      if (!roles.includes('platform_admin')) {
        throw new ForbiddenError('You are not allowed to manage this tournament', 'NOT_ALLOWED');
      }
    }
    await this.confirmAccepted(umpireId, fixtureId, {
      action: 'umpire.assigned',
      actorUserId: organizerId,
      entityType: 'fixture',
      entityId: fixtureId,
      meta: { umpireId },
      ip,
    });
    await this.deps.notifications.notify({
      userId: umpireId,
      type: 'umpire_assigned',
      title: 'You have been assigned',
      body: `You have been assigned to ${fixture.homeTeamName} vs ${fixture.awayTeamName}.`,
      payload: { fixtureId },
    });
  }

  async invite(
    organizerId: string,
    fixtureId: string,
    umpireId: string,
    ip?: string,
  ): Promise<void> {
    await this.deps.authz.assertRole(organizerId, 'organizer');
    const fixture = await this.deps.fixtures.findById(fixtureId);
    if (!fixture) throw new NotFoundError('Fixture not found');
    const tournament = await this.deps.tournaments.findById(fixture.tournamentId);
    if (!tournament) throw new NotFoundError('Tournament not found');
    if (tournament.organizerId !== organizerId) {
      const roles = await this.deps.authz.getRoles(organizerId);
      if (!roles.includes('platform_admin')) {
        throw new ForbiddenError('You are not allowed to manage this tournament', 'NOT_ALLOWED');
      }
    }
    const existing = await this.deps.assignments.find(fixtureId, umpireId);
    if (existing?.status === 'accepted') {
      throw new ConflictError('This umpire is already assigned to this match.', 'ALREADY_ASSIGNED');
    }
    await this.deps.assignments.upsertStatus(fixtureId, umpireId, 'invited');
    await this.deps.audit.write({
      action: 'umpire.invited',
      actorUserId: organizerId,
      entityType: 'fixture',
      entityId: fixtureId,
      meta: { umpireId },
      ip,
    });
    await this.deps.notifications.notify({
      userId: umpireId,
      type: 'umpire_invited',
      title: 'Umpire invitation',
      body: `You've been invited to officiate ${fixture.homeTeamName} vs ${fixture.awayTeamName}.`,
      payload: { fixtureId },
    });
  }

  private async confirmAccepted(
    umpireId: string,
    fixtureId: string,
    auditEntry?: AuditEntry,
  ): Promise<void> {
    const fixture = await this.deps.fixtures.findById(fixtureId);
    if (!fixture) throw new NotFoundError('Fixture not found');
    try {
      await this.deps.tx.run(
        async (db) => {
          const slots = await this.deps.assignments.acceptedSlots(umpireId, db);
          const clash = slots.some(
            (s) =>
              s.fixtureId !== fixtureId &&
              slotsOverlap(
                fixture.startsAt,
                fixture.durationMinutes,
                s.startsAt,
                s.durationMinutes,
              ),
          );
          if (clash) {
            throw new ConflictError(
              'This umpire already has an overlapping match at that time.',
              'UMPIRE_CONFLICT',
            );
          }
          await this.deps.assignments.upsertStatus(fixtureId, umpireId, 'accepted', db);
          if (auditEntry) await this.deps.audit.write(auditEntry, db);
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        throw new ConflictError(
          'A conflicting assignment happened at the same moment. Please try again.',
          'UMPIRE_CONFLICT',
        );
      }
      throw err;
    }
  }
}
