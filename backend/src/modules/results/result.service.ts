import type {
  EnterResultInput,
  FixtureRostersDto,
  PlayerInningsScoreDto,
  ResultDto,
} from '@nforce/shared';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import type { TxRunner } from '../../lib/db';
import type { AuditPort } from '../audit/audit.service';
import type { NotificationService } from '../notifications/notification.service';
import type { TeamRepoPort } from '../teams/team.repo';
import type { OrganizerTournamentRepoPort } from '../tournaments/organizerTournament.repo';
import type { AuthzService } from '../users-auth/authz.service';
import type {
  FixtureResultContext,
  PlayerInningsScoreRow,
  ResultData,
  ResultRepoPort,
} from './result.repo';
import { computeStandings } from './standings';

function toPlayerScoreDtos(rows: PlayerInningsScoreRow[], teamId: string): PlayerInningsScoreDto[] {
  return rows
    .filter((r) => r.teamId === teamId)
    .map((r) => ({ userId: r.userId, playerName: r.playerName, runs: r.runs, wickets: r.wickets }));
}

function toResultDto(saved: ResultData, ctx: FixtureResultContext): ResultDto {
  return {
    fixtureId: saved.fixtureId,
    homeScore: saved.homeScore,
    awayScore: saved.awayScore,
    winnerTeamId: saved.winnerTeamId,
    enteredByName: saved.enteredByName,
    enteredAt: saved.enteredAt.toISOString(),
    homeRunsTotal: saved.homeRunsTotal,
    awayRunsTotal: saved.awayRunsTotal,
    homePlayerScores: toPlayerScoreDtos(saved.playerScores, ctx.homeTeamId),
    awayPlayerScores: toPlayerScoreDtos(saved.playerScores, ctx.awayTeamId),
  };
}

export interface ResultServiceDeps {
  results: ResultRepoPort;
  tournaments: Pick<OrganizerTournamentRepoPort, 'findById'>;
  teams: Pick<TeamRepoPort, 'findById'>;
  notifications: NotificationService;
  authz: AuthzService;
  audit: AuditPort;
  tx: TxRunner;
}

export class ResultService {
  constructor(private readonly deps: ResultServiceDeps) {}

  private async assertCanEnterResults(actorId: string, tournamentId: string): Promise<void> {
    const tournament = await this.deps.tournaments.findById(tournamentId);
    if (!tournament) throw new NotFoundError('Tournament not found');
    if (tournament.organizerId !== actorId) {
      const roles = await this.deps.authz.getRoles(actorId);
      if (!roles.includes('platform_admin')) {
        throw new ForbiddenError('You are not allowed to enter results here', 'NOT_ALLOWED');
      }
    }
  }

  async rostersForFixture(actorId: string, fixtureId: string): Promise<FixtureRostersDto> {
    await this.deps.authz.assertRole(actorId, 'organizer');
    const ctx = await this.deps.results.fixtureContext(fixtureId);
    if (!ctx) throw new NotFoundError('Fixture not found');
    await this.assertCanEnterResults(actorId, ctx.tournamentId);

    const [homeTeam, awayTeam] = await Promise.all([
      this.deps.teams.findById(ctx.homeTeamId),
      this.deps.teams.findById(ctx.awayTeamId),
    ]);
    const acceptedOf = (team: Awaited<ReturnType<TeamRepoPort['findById']>>) =>
      (team?.roster ?? [])
        .filter((r) => r.status === 'accepted')
        .map((r) => ({ userId: r.userId, name: r.name }));
    return {
      home: { teamId: ctx.homeTeamId, players: acceptedOf(homeTeam) },
      away: { teamId: ctx.awayTeamId, players: acceptedOf(awayTeam) },
    };
  }

  private normalizeSide(
    playerScores: { userId: string; runs: number; wickets: number }[] | null | undefined,
    runsTotal: number | null | undefined,
    label: 'home' | 'away',
  ): { scores: { userId: string; runs: number; wickets: number }[]; total: number | null } {
    const scores = playerScores ?? [];
    const seen = new Set<string>();
    for (const s of scores) {
      if (seen.has(s.userId)) {
        throw new ConflictError(
          `A player can only be scored once per side (${label}).`,
          'DUPLICATE_PLAYER_SCORE',
        );
      }
      seen.add(s.userId);
    }
    if (scores.length === 0) return { scores, total: runsTotal ?? null };
    const sum = scores.reduce((acc, s) => acc + s.runs, 0);
    const total = runsTotal ?? sum;
    if (sum > total) {
      throw new ConflictError(
        `Player scores (${sum}) can't exceed the ${label} team's total (${total}).`,
        'PLAYER_SCORES_EXCEED_TOTAL',
      );
    }
    return { scores, total };
  }

  async enter(
    actorId: string,
    fixtureId: string,
    input: EnterResultInput,
    ip?: string,
  ): Promise<ResultDto> {
    await this.deps.authz.assertRole(actorId, 'organizer');
    const ctx = await this.deps.results.fixtureContext(fixtureId);
    if (!ctx) throw new NotFoundError('Fixture not found');
    await this.assertCanEnterResults(actorId, ctx.tournamentId);

    const winnerTeamId = input.winnerTeamId ?? null;
    if (
      winnerTeamId !== null &&
      winnerTeamId !== ctx.homeTeamId &&
      winnerTeamId !== ctx.awayTeamId
    ) {
      throw new ConflictError(
        'The winner must be one of the two teams in this match.',
        'INVALID_WINNER',
      );
    }

    const home = this.normalizeSide(input.homePlayerScores, input.homeRunsTotal, 'home');
    const away = this.normalizeSide(input.awayPlayerScores, input.awayRunsTotal, 'away');
    const homeIds = new Set(home.scores.map((s) => s.userId));
    if (away.scores.some((s) => homeIds.has(s.userId))) {
      throw new ConflictError(
        "A player can't be credited on both sides of the same match.",
        'PLAYER_ON_BOTH_SIDES',
      );
    }

    const previous = await this.deps.results.findByFixture(fixtureId);

    await this.deps.tx.run(async (db) => {
      const result = await this.deps.results.upsert(
        {
          fixtureId,
          homeScore: input.homeScore,
          awayScore: input.awayScore,
          winnerTeamId,
          enteredById: actorId,
          homeRunsTotal: home.total,
          awayRunsTotal: away.total,
        },
        db,
      );
      await this.deps.results.replacePlayerScores(
        result.id,
        ctx.homeTeamId,
        ctx.awayTeamId,
        home.scores,
        away.scores,
        db,
      );
      const [outcomes, teamIds] = await Promise.all([
        this.deps.results.outcomesForTournament(ctx.tournamentId, db),
        this.deps.results.registeredTeamIds(ctx.tournamentId, db),
      ]);
      const standings = computeStandings(teamIds, outcomes);
      await this.deps.results.replaceStandings(ctx.tournamentId, standings, db);
      await this.deps.audit.write(
        {
          action: 'result.entered',
          actorUserId: actorId,
          entityType: 'fixture',
          entityId: fixtureId,
          meta: {
            winnerTeamId,
            homeScore: input.homeScore,
            awayScore: input.awayScore,
            isCorrection: previous != null,
            ...(previous
              ? {
                  previousHomeScore: previous.homeScore,
                  previousAwayScore: previous.awayScore,
                  previousWinnerTeamId: previous.winnerTeamId,
                }
              : {}),
          },
          ip,
        },
        db,
      );
    });

    const winnerName =
      winnerTeamId === ctx.homeTeamId
        ? ctx.homeTeamName
        : winnerTeamId === ctx.awayTeamId
          ? ctx.awayTeamName
          : null;
    const matchDateTime = ctx.startsAt.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'UTC',
    });
    const summaryBody = winnerName
      ? `${winnerName} won: ${ctx.homeTeamName} ${input.homeScore} – ${ctx.awayTeamName} ${input.awayScore}.`
      : `Match drawn: ${ctx.homeTeamName} ${input.homeScore} – ${ctx.awayTeamName} ${input.awayScore}.`;
    for (const managerId of new Set([ctx.homeManagerId, ctx.awayManagerId])) {
      await this.deps.notifications.notify({
        userId: managerId,
        type: 'result_posted',
        title: `Match result posted: ${ctx.tournamentName}`,
        body: summaryBody,
        payload: { fixtureId },
        emailInfoCard: {
          title: 'Match result',
          rows: [
            { label: 'Tournament', value: ctx.tournamentName },
            ...(ctx.ageGroupLabel ? [{ label: 'Category', value: ctx.ageGroupLabel }] : []),
            { label: 'Match', value: `${ctx.homeTeamName} vs ${ctx.awayTeamName}` },
            { label: `${ctx.homeTeamName} score`, value: input.homeScore },
            { label: `${ctx.awayTeamName} score`, value: input.awayScore },
            { label: 'Result', value: winnerName ? `${winnerName} won` : 'Match drawn' },
            { label: 'Played', value: matchDateTime },
          ],
        },
      });
    }

    const saved = await this.deps.results.findByFixture(fixtureId);
    return toResultDto(saved!, ctx);
  }

  async getForFixture(fixtureId: string): Promise<ResultDto | null> {
    const ctx = await this.deps.results.fixtureContext(fixtureId);
    if (!ctx) throw new NotFoundError('Fixture not found');
    const saved = await this.deps.results.findByFixture(fixtureId);
    if (!saved) return null;
    return toResultDto(saved, ctx);
  }
}
