import {
  Prisma,
  type AssignmentStatus,
  type BookingStatus,
  type PrismaClient,
} from '@prisma/client';
import type { DbClient } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';
import { ageGroupLabel } from '../registrations/tournamentInvitation.repo';

export interface FixtureUmpireRow {
  umpireId: string;
  umpireName: string;
  status: AssignmentStatus;
}

export interface FixtureRow {
  id: string;
  tournamentId: string;
  tournamentName: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  groundId: string | null;
  groundName: string | null;
  groundBookingStatus: BookingStatus | null;
  startsAt: Date;
  durationMinutes: number;
  umpires: FixtureUmpireRow[];
  ageGroupId: string | null;
  ageGroupLabel: string | null;
}

export interface FixtureWrite {
  tournamentId: string;
  homeTeamId: string;
  awayTeamId: string;
  groundId?: string | null;
  startsAt: Date;
  durationMinutes: number;
}

export interface RegisteredTeam {
  id: string;
  name: string;
}

const include = {
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
      draftTournamentAgeGroupId: true,
      registrations: {
        where: { status: 'active' },
        select: { tournamentId: true, tournamentAgeGroupId: true },
      },
    },
  },
  awayTeam: { select: { name: true } },
  ground: { select: { name: true } },
  umpireAssignments: { include: { umpire: { select: { name: true } } } },
  bookings: { orderBy: { createdAt: 'desc' as const }, take: 1 },
} as const;

type FixturePayload = Prisma.FixtureGetPayload<{ include: typeof include }>;

function toRow(f: FixturePayload): FixtureRow {
  const prebuiltBracketId =
    f.homeTeam.registrations.find((r) => r.tournamentId === f.tournamentId)?.tournamentAgeGroupId ??
    null;
  const ageGroupId = f.homeTeam.draftTournamentAgeGroupId ?? prebuiltBracketId;
  const bracket = ageGroupId ? f.tournament.ageGroups.find((g) => g.id === ageGroupId) : undefined;
  return {
    id: f.id,
    tournamentId: f.tournamentId,
    tournamentName: f.tournament.name,
    homeTeamId: f.homeTeamId,
    homeTeamName: f.homeTeam.name,
    awayTeamId: f.awayTeamId,
    awayTeamName: f.awayTeam.name,
    groundId: f.groundId,
    groundName: f.ground?.name ?? null,
    groundBookingStatus: f.bookings[0]?.status ?? null,
    startsAt: f.startsAt,
    durationMinutes: f.durationMinutes,
    umpires: f.umpireAssignments.map((a) => ({
      umpireId: a.umpireId,
      umpireName: a.umpire.name,
      status: a.status,
    })),
    ageGroupId,
    ageGroupLabel: bracket ? ageGroupLabel(bracket.ageGroup.name, bracket.genderCategory) : null,
  };
}

export interface FixtureRepoPort {
  create(data: FixtureWrite, db?: DbClient): Promise<FixtureRow>;
  findById(id: string): Promise<FixtureRow | null>;
  listForTournament(tournamentId: string): Promise<FixtureRow[]>;
  listForTeamIds(teamIds: string[]): Promise<FixtureRow[]>;
  updateTime(
    id: string,
    startsAt: Date,
    durationMinutes: number,
    groundId?: string | null,
    db?: DbClient,
  ): Promise<FixtureRow>;
  clearGround(id: string, db?: DbClient): Promise<void>;
  registeredTeams(tournamentId: string): Promise<RegisteredTeam[]>;
  listOpenForUmpire(
    umpireId: string,
  ): Promise<(FixtureRow & { myStatus: AssignmentStatus | null })[]>;
}

export class PrismaFixtureRepo implements FixtureRepoPort {
  constructor(private readonly client: PrismaClient) {}

  async create(data: FixtureWrite, db: DbClient = this.client): Promise<FixtureRow> {
    const f = await db.fixture.create({
      data: {
        tournamentId: data.tournamentId,
        homeTeamId: data.homeTeamId,
        awayTeamId: data.awayTeamId,
        groundId: data.groundId ?? null,
        startsAt: data.startsAt,
        durationMinutes: data.durationMinutes,
      },
      include,
    });
    return toRow(f);
  }

  async findById(id: string): Promise<FixtureRow | null> {
    const f = await this.client.fixture.findUnique({ where: { id }, include });
    return f ? toRow(f) : null;
  }

  async listForTournament(tournamentId: string): Promise<FixtureRow[]> {
    const rows = await this.client.fixture.findMany({
      where: { tournamentId },
      include,
      orderBy: { startsAt: 'asc' },
    });
    return rows.map(toRow);
  }

  async listForTeamIds(teamIds: string[]): Promise<FixtureRow[]> {
    if (teamIds.length === 0) return [];
    const rows = await this.client.fixture.findMany({
      where: {
        OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
        tournament: { status: { in: ['published', 'closed'] } },
      },
      include,
      orderBy: { startsAt: 'asc' },
    });
    return rows.map(toRow);
  }

  async updateTime(
    id: string,
    startsAt: Date,
    durationMinutes: number,
    groundId?: string | null,
    db: DbClient = this.client,
  ): Promise<FixtureRow> {
    try {
      const f = await db.fixture.update({
        where: { id },
        data: { startsAt, durationMinutes, groundId },
        include,
      });
      return toRow(f);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('Fixture not found');
      }
      throw err;
    }
  }

  async clearGround(id: string, db: DbClient = this.client): Promise<void> {
    try {
      await db.fixture.update({ where: { id }, data: { groundId: null } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('Fixture not found');
      }
      throw err;
    }
  }

  async registeredTeams(tournamentId: string): Promise<RegisteredTeam[]> {
    const rows = await this.client.registration.findMany({
      where: { tournamentId, status: 'active', teamId: { not: null } },
      include: { team: { select: { id: true, name: true } } },
    });
    return rows.flatMap((r) => (r.team ? [{ id: r.team.id, name: r.team.name }] : []));
  }

  async listOpenForUmpire(
    umpireId: string,
  ): Promise<(FixtureRow & { myStatus: AssignmentStatus | null })[]> {
    const rows = await this.client.fixture.findMany({
      where: { tournament: { status: 'published' } },
      include,
    });
    return (
      rows
        .map((f) => {
          const mine = f.umpireAssignments.find((a) => a.umpireId === umpireId);
          return {
            ...toRow(f),
            myStatus: mine?.status ?? null,
            arrivedAt: mine?.createdAt ?? f.createdAt,
          };
        })
        .sort((a, b) => b.arrivedAt.getTime() - a.arrivedAt.getTime())
        .map(({ arrivedAt: _arrivedAt, ...row }) => row)
    );
  }
}
