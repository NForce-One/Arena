import type { FixtureDto, RescheduleFixtureInput, ScheduleFixtureInput } from '@nforce/shared';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import type { TxRunner } from '../../lib/db';
import type { AuditPort } from '../audit/audit.service';
import type { BookingRepoPort } from '../grounds/booking.repo';
import { isWithinAvailability } from '../grounds/booking.service';
import type { GroundRepoPort } from '../grounds/ground.repo';
import type { NotificationService } from '../notifications/notification.service';
import type { TeamRepoPort } from '../teams/team.repo';
import type { OrganizerTournamentRepoPort } from '../tournaments/organizerTournament.repo';
import type { AuthzService } from '../users-auth/authz.service';
import type { UserRepoPort } from '../users-auth/user.repo';
import type { FixtureRepoPort, FixtureRow } from './fixture.repo';
import { slotsOverlap } from './overlap';
import type { UmpireAssignmentRepoPort } from './umpireAssignment.repo';

function toDto(row: FixtureRow): FixtureDto {
  return {
    id: row.id,
    tournamentId: row.tournamentId,
    homeTeamId: row.homeTeamId,
    homeTeam: row.homeTeamName,
    awayTeamId: row.awayTeamId,
    awayTeam: row.awayTeamName,
    groundId: row.groundId,
    ground: row.groundName,
    groundBookingStatus: row.groundBookingStatus,
    startsAt: row.startsAt.toISOString(),
    durationMinutes: row.durationMinutes,
    umpires: row.umpires.map((u) => ({
      umpireId: u.umpireId,
      umpireName: u.umpireName,
      status: u.status,
    })),
    ageGroupId: row.ageGroupId,
    ageGroupLabel: row.ageGroupLabel,
  };
}

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function humanDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${MONTHS[(m ?? 1) - 1]} ${d}, ${y}`;
}

function assertWithinTournamentDates(
  tournament: { name: string; startDate: Date; endDate: Date },
  startsAt: Date,
  endsAt: Date,
): void {
  const from = utcDay(tournament.startDate);
  const to = utcDay(tournament.endDate);
  if (utcDay(startsAt) < from || utcDay(endsAt) > to) {
    throw new ConflictError(
      `A match must be scheduled between ${humanDay(from)} and ${humanDay(to)}, the dates of ${tournament.name}.`,
      'OUTSIDE_TOURNAMENT_DATES',
    );
  }
}

export interface FixtureServiceDeps {
  fixtures: FixtureRepoPort;
  bookings: Pick<BookingRepoPort, 'create' | 'setStatus' | 'listForGround'>;
  grounds: Pick<GroundRepoPort, 'findById'>;
  umpires: Pick<UmpireAssignmentRepoPort, 'upsertStatus' | 'acceptedSlots'>;
  users: Pick<UserRepoPort, 'findByEmail'>;
  tournaments: Pick<OrganizerTournamentRepoPort, 'findById'>;
  teams: Pick<TeamRepoPort, 'findById'>;
  notifications: NotificationService;
  authz: AuthzService;
  audit: AuditPort;
  tx: TxRunner;
}

export class FixtureService {
  constructor(private readonly deps: FixtureServiceDeps) {}

  private async assertOwnsPublishedTournament(actorId: string, tournamentId: string) {
    const tournament = await this.deps.tournaments.findById(tournamentId);
    if (!tournament) throw new NotFoundError('Tournament not found');
    if (tournament.organizerId !== actorId) {
      const roles = await this.deps.authz.getRoles(actorId);
      if (!roles.includes('platform_admin')) {
        throw new ForbiddenError('You are not allowed to manage this tournament', 'NOT_ALLOWED');
      }
    }
    return tournament;
  }

  async schedule(
    actorId: string,
    tournamentId: string,
    input: ScheduleFixtureInput,
    ip?: string,
  ): Promise<FixtureDto> {
    await this.deps.authz.assertRole(actorId, 'organizer');
    const tournament = await this.assertOwnsPublishedTournament(actorId, tournamentId);
    if (tournament.status === 'draft') {
      throw new ConflictError(
        'A match can only be scheduled once the tournament is published.',
        'TOURNAMENT_NOT_PUBLISHED',
      );
    }

    const registeredTeams = await this.deps.fixtures.registeredTeams(tournamentId);
    const registeredIds = new Set(registeredTeams.map((t) => t.id));
    const isValidSide = async (teamId: string): Promise<boolean> => {
      if (registeredIds.has(teamId)) return true;
      if (tournament.teamSelectionMode !== 'draft_based') return false;
      const team = await this.deps.teams.findById(teamId);
      return !!team && team.managerId === tournament.organizerId;
    };
    if (!(await isValidSide(input.homeTeamId)) || !(await isValidSide(input.awayTeamId))) {
      throw new ConflictError(
        'Both teams must be registered in this tournament.',
        'TEAM_NOT_REGISTERED',
      );
    }

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
    assertWithinTournamentDates(tournament, startsAt, endsAt);

    const umpireIds: string[] = [];
    for (const email of input.umpireEmails) {
      if (!email) continue;
      const u = await this.deps.users.findByEmail(email);
      if (!u) throw new NotFoundError(`No account exists for umpire ${email}`, 'UMPIRE_NOT_FOUND');
      umpireIds.push(u.id);
    }

    let ground: Awaited<ReturnType<GroundRepoPort['findById']>> = null;
    if (input.groundId) {
      ground = await this.deps.grounds.findById(input.groundId);
      if (!ground) throw new NotFoundError('Ground not found');
      if (!isWithinAvailability(ground.availabilityRules, startsAt, endsAt)) {
        throw new ConflictError(
          "That time is outside the ground's available days/hours.",
          'OUTSIDE_AVAILABILITY',
        );
      }
    }

    const fixture = await this.deps.tx.run(async (db) => {
      const created = await this.deps.fixtures.create(
        {
          tournamentId,
          homeTeamId: input.homeTeamId,
          awayTeamId: input.awayTeamId,
          groundId: input.groundId ?? null,
          startsAt,
          durationMinutes: input.durationMinutes,
        },
        db,
      );
      if (input.groundId) {
        await this.deps.bookings.create(
          {
            groundId: input.groundId,
            requesterId: actorId,
            fixtureId: created.id,
            startsAt,
            endsAt,
          },
          db,
        );
      }
      for (const umpireId of umpireIds) {
        await this.deps.umpires.upsertStatus(created.id, umpireId, 'invited', db);
      }
      await this.deps.audit.write(
        {
          action: 'fixture.scheduled',
          actorUserId: actorId,
          entityType: 'fixture',
          entityId: created.id,
          meta: { tournamentId },
          ip,
        },
        db,
      );
      return created;
    });

    if (ground) {
      await this.deps.notifications.notify({
        userId: ground.ownerId,
        type: 'booking_requested',
        title: 'New booking request',
        body: `A booking was requested for ${ground.name}.`,
        payload: { fixtureId: fixture.id },
      });
    }
    for (const umpireId of umpireIds) {
      await this.deps.notifications.notify({
        userId: umpireId,
        type: 'umpire_invited',
        title: 'Umpire invitation',
        body: `You have been invited to officiate ${fixture.homeTeamName} vs ${fixture.awayTeamName}.`,
        payload: { fixtureId: fixture.id },
      });
    }
    await this.notifyTeamManagers(
      actorId,
      input.homeTeamId,
      input.awayTeamId,
      fixture.id,
      'fixture_scheduled',
      `New match: ${fixture.homeTeamName} vs ${fixture.awayTeamName}`,
      `${fixture.homeTeamName} vs ${fixture.awayTeamName} was scheduled for ${tournament.name}.`,
    );

    const full = await this.deps.fixtures.findById(fixture.id);
    return toDto(full!);
  }

  private async notifyTeamManagers(
    actorId: string,
    homeTeamId: string,
    awayTeamId: string,
    fixtureId: string,
    type: string,
    title: string,
    body: string,
  ): Promise<void> {
    const [home, away] = await Promise.all([
      this.deps.teams.findById(homeTeamId),
      this.deps.teams.findById(awayTeamId),
    ]);
    const managerIds = new Set(
      [home?.managerId, away?.managerId].filter((id): id is string => !!id && id !== actorId),
    );
    for (const userId of managerIds) {
      await this.deps.notifications.notify({
        userId,
        type,
        title,
        body,
        payload: { fixtureId, forRole: 'team_manager' },
      });
    }
  }

  async listForTournament(actorId: string, tournamentId: string): Promise<FixtureDto[]> {
    await this.assertOwnsPublishedTournament(actorId, tournamentId);
    const rows = await this.deps.fixtures.listForTournament(tournamentId);
    return rows.map(toDto);
  }

  async reschedule(
    actorId: string,
    fixtureId: string,
    input: RescheduleFixtureInput,
    ip?: string,
  ): Promise<FixtureDto> {
    await this.deps.authz.assertRole(actorId, 'organizer');
    const fixture = await this.deps.fixtures.findById(fixtureId);
    if (!fixture) throw new NotFoundError('Fixture not found');
    const tournament = await this.assertOwnsPublishedTournament(actorId, fixture.tournamentId);

    const newStart = new Date(input.startsAt);
    const newEnd = new Date(newStart.getTime() + input.durationMinutes * 60_000);
    assertWithinTournamentDates(tournament, newStart, newEnd);

    for (const assignment of fixture.umpires.filter((u) => u.status === 'accepted')) {
      const slots = await this.deps.umpires.acceptedSlots(assignment.umpireId);
      const clash = slots.some(
        (s) =>
          s.fixtureId !== fixtureId &&
          slotsOverlap(newStart, input.durationMinutes, s.startsAt, s.durationMinutes),
      );
      if (clash) {
        throw new ConflictError(
          `Reschedule refused: ${assignment.umpireName} has another match at that time.`,
          'UMPIRE_CONFLICT',
        );
      }
    }

    const effectiveGroundId = input.groundId !== undefined ? input.groundId : fixture.groundId;
    let ground: Awaited<ReturnType<GroundRepoPort['findById']>> = null;
    if (effectiveGroundId) {
      ground = await this.deps.grounds.findById(effectiveGroundId);
      if (!ground) throw new NotFoundError('Ground not found');
      if (!isWithinAvailability(ground.availabilityRules, newStart, newEnd)) {
        throw new ConflictError(
          "That time is outside the ground's available days/hours.",
          'OUTSIDE_AVAILABILITY',
        );
      }
    }
    const acceptedUmpires = fixture.umpires.filter((u) => u.status === 'accepted');
    const oldGround = fixture.groundId ? await this.deps.grounds.findById(fixture.groundId) : null;
    let oldBookingCancelled = false;

    await this.deps.tx.run(async (db) => {
      if (fixture.groundId) {
        const existing = await this.deps.bookings.listForGround(fixture.groundId);
        for (const b of existing) {
          if (b.fixtureId === fixtureId && (b.status === 'requested' || b.status === 'confirmed')) {
            await this.deps.bookings.setStatus(b.id, 'cancelled', db);
            oldBookingCancelled = true;
          }
        }
      }
      if (effectiveGroundId) {
        await this.deps.bookings.create(
          {
            groundId: effectiveGroundId,
            requesterId: actorId,
            fixtureId,
            startsAt: newStart,
            endsAt: newEnd,
          },
          db,
        );
      }
      await this.deps.fixtures.updateTime(
        fixtureId,
        newStart,
        input.durationMinutes,
        input.groundId,
        db,
      );
      await this.deps.audit.write(
        {
          action: 'fixture.rescheduled',
          actorUserId: actorId,
          entityType: 'fixture',
          entityId: fixtureId,
          meta: {
            previousStartsAt: fixture.startsAt.toISOString(),
            startsAt: newStart.toISOString(),
            previousDurationMinutes: fixture.durationMinutes,
            durationMinutes: input.durationMinutes,
            groundChanged: input.groundId !== undefined && input.groundId !== fixture.groundId,
          },
          ip,
        },
        db,
      );
    });

    if (oldBookingCancelled && oldGround) {
      await this.deps.notifications.notify({
        userId: oldGround.ownerId,
        type: 'booking_cancelled',
        title: 'Booking cancelled',
        body: `Your booking for ${oldGround.name} (${fixture.homeTeamName} vs ${fixture.awayTeamName}) was cancelled. The match was rescheduled.`,
        payload: { fixtureId, forRole: 'ground_owner' },
      });
    }
    if (ground) {
      await this.deps.notifications.notify({
        userId: ground.ownerId,
        type: 'booking_requested',
        title: 'New booking request',
        body: `A booking was requested for ${ground.name} (${fixture.homeTeamName} vs ${fixture.awayTeamName} was rescheduled).`,
        payload: { fixtureId },
      });
    }
    for (const assignment of acceptedUmpires) {
      await this.deps.notifications.notify({
        userId: assignment.umpireId,
        type: 'fixture_rescheduled',
        title: `Match time changed: ${fixture.homeTeamName} vs ${fixture.awayTeamName}`,
        body: `${fixture.homeTeamName} vs ${fixture.awayTeamName} (${tournament.name}) was rescheduled to ${newStart.toISOString()}.`,
        payload: { fixtureId, forRole: 'umpire' },
      });
    }
    await this.notifyTeamManagers(
      actorId,
      fixture.homeTeamId,
      fixture.awayTeamId,
      fixtureId,
      'fixture_rescheduled',
      `Match time changed: ${fixture.homeTeamName} vs ${fixture.awayTeamName}`,
      `${fixture.homeTeamName} vs ${fixture.awayTeamName} (${tournament.name}) was rescheduled to ${newStart.toISOString()}.`,
    );

    const updated = await this.deps.fixtures.findById(fixtureId);
    return toDto(updated!);
  }
}
