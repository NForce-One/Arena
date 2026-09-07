import type { Prisma, PrismaClient } from '@prisma/client';
import type { DbClient } from '../../lib/db';
import { ageGroupLabel } from '../registrations/tournamentInvitation.repo';

export interface FixtureResultContext {
  tournamentId: string;
  tournamentName: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  homeManagerId: string;
  awayManagerId: string;
  startsAt: Date;
  ageGroupLabel: string | null;
}

export interface PlayerInningsScoreRow {
  userId: string;
  playerName: string;
  teamId: string;
  runs: number;
  wickets: number;
}

export interface ResultData {
  fixtureId: string;
  homeScore: string;
  awayScore: string;
  winnerTeamId: string | null;
  enteredByName: string;
  enteredAt: Date;
  homeRunsTotal: number | null;
  awayRunsTotal: number | null;
  playerScores: PlayerInningsScoreRow[];
}

export interface ResultOutcome {
  homeTeamId: string;
  awayTeamId: string;
  winnerTeamId: string | null;
}

export interface StandingRow {
  teamId: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  points: number;
}

export interface ResultRepoPort {
  fixtureContext(fixtureId: string): Promise<FixtureResultContext | null>;
  findByFixture(fixtureId: string): Promise<ResultData | null>;
  findByFixtureIds(fixtureIds: string[]): Promise<ResultData[]>;
  upsert(
    data: {
      fixtureId: string;
      homeScore: string;
      awayScore: string;
      winnerTeamId: string | null;
      enteredById: string;
      homeRunsTotal: number | null;
      awayRunsTotal: number | null;
    },
    db?: DbClient,
  ): Promise<{ id: string }>;
  replacePlayerScores(
    resultId: string,
    homeTeamId: string,
    awayTeamId: string,
    homeScores: { userId: string; runs: number; wickets: number }[],
    awayScores: { userId: string; runs: number; wickets: number }[],
    db?: DbClient,
  ): Promise<void>;
  outcomesForTournament(tournamentId: string, db?: DbClient): Promise<ResultOutcome[]>;
  registeredTeamIds(tournamentId: string, db?: DbClient): Promise<string[]>;
  replaceStandings(tournamentId: string, rows: StandingRow[], db?: DbClient): Promise<void>;
}

export class PrismaResultRepo implements ResultRepoPort {
  constructor(private readonly client: PrismaClient) {}

  async fixtureContext(fixtureId: string): Promise<FixtureResultContext | null> {
    const f = await this.client.fixture.findUnique({
      where: { id: fixtureId },
      select: {
        tournamentId: true,
        homeTeamId: true,
        awayTeamId: true,
        startsAt: true,
        tournament: {
          select: {
            name: true,
            ageGroups: {
              select: { id: true, genderCategory: true, ageGroup: { select: { name: true } } },
            },
          },
        },
        homeTeam: {
          select: {
            name: true,
            managerId: true,
            draftTournamentAgeGroupId: true,
            registrations: {
              where: { status: 'active' },
              select: { tournamentId: true, tournamentAgeGroupId: true },
            },
          },
        },
        awayTeam: { select: { name: true, managerId: true } },
      },
    });
    if (!f) return null;
    const prebuiltBracketId =
      f.homeTeam.registrations.find((r) => r.tournamentId === f.tournamentId)
        ?.tournamentAgeGroupId ?? null;
    const bracketId = f.homeTeam.draftTournamentAgeGroupId ?? prebuiltBracketId;
    const bracket = bracketId ? f.tournament.ageGroups.find((g) => g.id === bracketId) : undefined;
    return {
      tournamentId: f.tournamentId,
      tournamentName: f.tournament.name,
      homeTeamId: f.homeTeamId,
      homeTeamName: f.homeTeam.name,
      awayTeamId: f.awayTeamId,
      awayTeamName: f.awayTeam.name,
      homeManagerId: f.homeTeam.managerId,
      awayManagerId: f.awayTeam.managerId,
      startsAt: f.startsAt,
      ageGroupLabel: bracket ? ageGroupLabel(bracket.ageGroup.name, bracket.genderCategory) : null,
    };
  }

  private static readonly resultInclude = {
    enteredBy: { select: { name: true } },
    playerScores: { include: { user: { select: { name: true } } } },
  } satisfies Prisma.ResultInclude;

  private toResultData(
    r: Prisma.ResultGetPayload<{ include: typeof PrismaResultRepo.resultInclude }>,
  ): ResultData {
    return {
      fixtureId: r.fixtureId,
      homeScore: r.homeScore,
      awayScore: r.awayScore,
      winnerTeamId: r.winnerTeamId,
      enteredByName: r.enteredBy.name,
      enteredAt: r.enteredAt,
      homeRunsTotal: r.homeRunsTotal,
      awayRunsTotal: r.awayRunsTotal,
      playerScores: r.playerScores.map((p) => ({
        userId: p.userId,
        playerName: p.user.name,
        teamId: p.teamId,
        runs: p.runs,
        wickets: p.wickets,
      })),
    };
  }

  async findByFixture(fixtureId: string): Promise<ResultData | null> {
    const r = await this.client.result.findUnique({
      where: { fixtureId },
      include: PrismaResultRepo.resultInclude,
    });
    return r ? this.toResultData(r) : null;
  }

  async findByFixtureIds(fixtureIds: string[]): Promise<ResultData[]> {
    if (fixtureIds.length === 0) return [];
    const rows = await this.client.result.findMany({
      where: { fixtureId: { in: fixtureIds } },
      include: PrismaResultRepo.resultInclude,
    });
    return rows.map((r) => this.toResultData(r));
  }

  async upsert(
    data: {
      fixtureId: string;
      homeScore: string;
      awayScore: string;
      winnerTeamId: string | null;
      enteredById: string;
      homeRunsTotal: number | null;
      awayRunsTotal: number | null;
    },
    db: DbClient = this.client,
  ): Promise<{ id: string }> {
    const row = await db.result.upsert({
      where: { fixtureId: data.fixtureId },
      create: data,
      update: {
        homeScore: data.homeScore,
        awayScore: data.awayScore,
        winnerTeamId: data.winnerTeamId,
        enteredById: data.enteredById,
        homeRunsTotal: data.homeRunsTotal,
        awayRunsTotal: data.awayRunsTotal,
        enteredAt: new Date(),
      },
      select: { id: true },
    });
    return row;
  }

  async replacePlayerScores(
    resultId: string,
    homeTeamId: string,
    awayTeamId: string,
    homeScores: { userId: string; runs: number; wickets: number }[],
    awayScores: { userId: string; runs: number; wickets: number }[],
    db: DbClient = this.client,
  ): Promise<void> {
    await db.playerInningsScore.deleteMany({ where: { resultId } });
    const rows = [
      ...homeScores.map((s) => ({
        resultId,
        userId: s.userId,
        teamId: homeTeamId,
        runs: s.runs,
        wickets: s.wickets,
      })),
      ...awayScores.map((s) => ({
        resultId,
        userId: s.userId,
        teamId: awayTeamId,
        runs: s.runs,
        wickets: s.wickets,
      })),
    ];
    if (rows.length > 0) {
      await db.playerInningsScore.createMany({ data: rows });
    }
  }

  async outcomesForTournament(
    tournamentId: string,
    db: DbClient = this.client,
  ): Promise<ResultOutcome[]> {
    const rows = await db.result.findMany({
      where: { fixture: { tournamentId } },
      select: { winnerTeamId: true, fixture: { select: { homeTeamId: true, awayTeamId: true } } },
    });
    return rows.map((r) => ({
      homeTeamId: r.fixture.homeTeamId,
      awayTeamId: r.fixture.awayTeamId,
      winnerTeamId: r.winnerTeamId,
    }));
  }

  async registeredTeamIds(tournamentId: string, db: DbClient = this.client): Promise<string[]> {
    const rows = await db.registration.findMany({
      where: { tournamentId, status: 'active', teamId: { not: null } },
      select: { teamId: true },
    });
    return rows.flatMap((r) => (r.teamId ? [r.teamId] : []));
  }

  async replaceStandings(
    tournamentId: string,
    rows: StandingRow[],
    db: DbClient = this.client,
  ): Promise<void> {
    await db.standing.deleteMany({ where: { tournamentId } });
    if (rows.length > 0) {
      await db.standing.createMany({ data: rows.map((r) => ({ tournamentId, ...r })) });
    }
  }
}
