import type {
  Prisma,
  PrismaClient,
  TeamSelectionMode,
  TournamentGenderCategory,
  TournamentStatus,
  TournamentStructure,
} from '@prisma/client';
export interface PublicAgeGroupRow {
  id: string;
  ageGroupId: string;
  name: string;
  bornAfter: Date | null;
  bornBefore: Date | null;
  genderCategory: TournamentGenderCategory;
  registrationStartDate: Date;
  registrationEndDate: Date;
  capacity: number | null;
  registeredCount: number;
  format: string;
  entryFee: number | null;
  oversPerInnings: number | null;
}

export interface TournamentSummaryRow {
  id: string;
  name: string;
  description: string | null;
  structure: TournamentStructure;
  teamSelectionMode: TeamSelectionMode;
  ageGroups: PublicAgeGroupRow[];
  status: TournamentStatus;
  startDate: Date;
  endDate: Date;
  rules: string | null;
  rulesDocumentKey: string | null;
  prizePoolAmount: number | null;
  prizePoolDescription: string | null;
  locationCity: string | null;
  locationState: string | null;
  surfaceTypeName: string | null;
  maxMarqueePlayers: number | null;
  capacity: number | null;
  registeredCount: number;
  organizerId: string;
  organizerName: string;
  organizerAcademyName: string | null;
  teamsCount: number;
  fixtureDates: string[];
}

export interface FixtureResultRow {
  homeScore: string;
  awayScore: string;
  winnerTeamName: string | null;
  homeRunsTotal: number | null;
  awayRunsTotal: number | null;
  homePlayerScores: { userId: string; playerName: string; runs: number; wickets: number }[];
  awayPlayerScores: { userId: string; playerName: string; runs: number; wickets: number }[];
}

export interface TournamentDetailRow extends TournamentSummaryRow {
  fixtures: {
    id: string;
    homeTeamName: string;
    awayTeamName: string;
    groundName: string | null;
    startsAt: Date;
    durationMinutes: number;
    result: FixtureResultRow | null;
  }[];
  standings: {
    teamName: string;
    played: number;
    won: number;
    lost: number;
    drawn: number;
    points: number;
  }[];
}

export interface TournamentRepoPort {
  listSummaries(statuses: TournamentStatus[]): Promise<TournamentSummaryRow[]>;
  findDetail(id: string): Promise<TournamentDetailRow | null>;
}

const summaryInclude = {
  ageGroups: {
    select: {
      id: true,
      ageGroupId: true,
      bornAfter: true,
      bornBefore: true,
      genderCategory: true,
      registrationStartDate: true,
      registrationEndDate: true,
      capacity: true,
      format: true,
      entryFee: true,
      oversPerInnings: true,
      ageGroup: { select: { name: true } },
      registrations: {
        where: { status: 'active' as const },
        select: { teamId: true, userId: true },
      },
    },
  },
  organizer: { select: { name: true, academyName: true } },
  surfaceType: { select: { name: true } },
  registrations: {
    where: { status: 'active' as const },
    select: { id: true, teamId: true, userId: true },
  },
  fixtures: { select: { startsAt: true } },
} satisfies Prisma.TournamentInclude;

function toFixtureDates(fixtures: { startsAt: Date }[]): string[] {
  return Array.from(new Set(fixtures.map((f) => f.startsAt.toISOString().slice(0, 10))));
}

function toAgeGroupRows(
  ageGroups: {
    id: string;
    ageGroupId: string;
    bornAfter: Date | null;
    bornBefore: Date | null;
    genderCategory: TournamentGenderCategory;
    registrationStartDate: Date;
    registrationEndDate: Date;
    capacity: number | null;
    format: string;
    entryFee: Prisma.Decimal | null;
    oversPerInnings: number | null;
    ageGroup: { name: string };
    registrations: { teamId: string | null; userId: string | null }[];
  }[],
  teamSelectionMode: TeamSelectionMode,
): PublicAgeGroupRow[] {
  return ageGroups.map((g) => ({
    id: g.id,
    ageGroupId: g.ageGroupId,
    name: g.ageGroup.name,
    bornAfter: g.bornAfter,
    bornBefore: g.bornBefore,
    genderCategory: g.genderCategory,
    registrationStartDate: g.registrationStartDate,
    registrationEndDate: g.registrationEndDate,
    capacity: g.capacity,
    format: g.format,
    entryFee: g.entryFee != null ? Number(g.entryFee) : null,
    oversPerInnings: g.oversPerInnings,
    registeredCount:
      teamSelectionMode === 'draft_based'
        ? g.registrations.filter((r) => r.userId != null).length
        : g.registrations.filter((r) => r.teamId != null).length,
  }));
}

export class PrismaTournamentRepo implements TournamentRepoPort {
  constructor(private readonly client: PrismaClient) {}

  async listSummaries(statuses: TournamentStatus[]): Promise<TournamentSummaryRow[]> {
    const rows = await this.client.tournament.findMany({
      where: { status: { in: statuses } },
      include: summaryInclude,
      orderBy: { startDate: 'desc' },
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      structure: t.structure,
      teamSelectionMode: t.teamSelectionMode,
      ageGroups: toAgeGroupRows(t.ageGroups, t.teamSelectionMode),
      status: t.status,
      startDate: t.startDate,
      endDate: t.endDate,
      rules: t.rules,
      rulesDocumentKey: t.rulesDocumentKey,
      prizePoolAmount: t.prizePoolAmount != null ? Number(t.prizePoolAmount) : null,
      prizePoolDescription: t.prizePoolDescription,
      locationCity: t.locationCity,
      locationState: t.locationState,
      surfaceTypeName: t.surfaceType?.name ?? null,
      maxMarqueePlayers: t.maxMarqueePlayers,
      capacity: t.capacity,
      registeredCount:
        t.teamSelectionMode === 'draft_based'
          ? t.registrations.filter((r) => r.userId != null).length
          : t.registrations.filter((r) => r.teamId != null).length,
      organizerId: t.organizerId,
      organizerName: t.organizer.name,
      organizerAcademyName: t.organizer.academyName,
      teamsCount: t.registrations.filter((r) => r.teamId != null).length,
      fixtureDates: toFixtureDates(t.fixtures),
    }));
  }

  async findDetail(id: string): Promise<TournamentDetailRow | null> {
    const t = await this.client.tournament.findUnique({
      where: { id },
      include: {
        ...summaryInclude,
        fixtures: {
          orderBy: { startsAt: 'asc' },
          include: {
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
            ground: { select: { name: true } },
            result: {
              include: {
                winnerTeam: { select: { name: true } },
                playerScores: { include: { user: { select: { name: true } } } },
              },
            },
          },
        },
        standings: {
          orderBy: [{ points: 'desc' }, { won: 'desc' }],
          include: { team: { select: { name: true } } },
        },
      },
    });
    if (!t) return null;
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      structure: t.structure,
      teamSelectionMode: t.teamSelectionMode,
      ageGroups: toAgeGroupRows(t.ageGroups, t.teamSelectionMode),
      status: t.status,
      startDate: t.startDate,
      endDate: t.endDate,
      rules: t.rules,
      rulesDocumentKey: t.rulesDocumentKey,
      prizePoolAmount: t.prizePoolAmount != null ? Number(t.prizePoolAmount) : null,
      prizePoolDescription: t.prizePoolDescription,
      locationCity: t.locationCity,
      locationState: t.locationState,
      surfaceTypeName: t.surfaceType?.name ?? null,
      maxMarqueePlayers: t.maxMarqueePlayers,
      capacity: t.capacity,
      registeredCount:
        t.teamSelectionMode === 'draft_based'
          ? t.registrations.filter((r) => r.userId != null).length
          : t.registrations.filter((r) => r.teamId != null).length,
      organizerId: t.organizerId,
      organizerName: t.organizer.name,
      organizerAcademyName: t.organizer.academyName,
      teamsCount: t.registrations.filter((r) => r.teamId != null).length,
      fixtureDates: toFixtureDates(t.fixtures),
      fixtures: t.fixtures.map((f) => ({
        id: f.id,
        homeTeamName: f.homeTeam.name,
        awayTeamName: f.awayTeam.name,
        groundName: f.ground?.name ?? null,
        startsAt: f.startsAt,
        durationMinutes: f.durationMinutes,
        result: f.result
          ? {
              homeScore: f.result.homeScore,
              awayScore: f.result.awayScore,
              winnerTeamName: f.result.winnerTeam?.name ?? null,
              homeRunsTotal: f.result.homeRunsTotal,
              awayRunsTotal: f.result.awayRunsTotal,
              homePlayerScores: f.result.playerScores
                .filter((p) => p.teamId === f.homeTeamId)
                .map((p) => ({
                  userId: p.userId,
                  playerName: p.user.name,
                  runs: p.runs,
                  wickets: p.wickets,
                })),
              awayPlayerScores: f.result.playerScores
                .filter((p) => p.teamId === f.awayTeamId)
                .map((p) => ({
                  userId: p.userId,
                  playerName: p.user.name,
                  runs: p.runs,
                  wickets: p.wickets,
                })),
            }
          : null,
      })),
      standings: t.standings.map((s) => ({
        teamName: s.team.name,
        played: s.played,
        won: s.won,
        lost: s.lost,
        drawn: s.drawn,
        points: s.points,
      })),
    };
  }
}
