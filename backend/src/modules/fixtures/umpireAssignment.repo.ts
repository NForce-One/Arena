import { Prisma, type AssignmentStatus, type PrismaClient } from '@prisma/client';
import type { DbClient } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';

export interface AcceptedSlot {
  fixtureId: string;
  startsAt: Date;
  durationMinutes: number;
}

export interface UmpireScheduleRow {
  fixtureId: string;
  tournamentName: string;
  homeTeamName: string;
  awayTeamName: string;
  groundName: string | null;
  startsAt: Date;
  durationMinutes: number;
}

export interface UmpireAssignmentRepoPort {
  upsertStatus(
    fixtureId: string,
    umpireId: string,
    status: AssignmentStatus,
    db?: DbClient,
  ): Promise<void>;
  find(fixtureId: string, umpireId: string): Promise<{ status: AssignmentStatus } | null>;
  setStatus(
    fixtureId: string,
    umpireId: string,
    status: AssignmentStatus,
    db?: DbClient,
  ): Promise<void>;
  acceptedSlots(umpireId: string, db?: DbClient): Promise<AcceptedSlot[]>;
  scheduleFor(umpireId: string): Promise<UmpireScheduleRow[]>;
}

export class PrismaUmpireAssignmentRepo implements UmpireAssignmentRepoPort {
  constructor(private readonly client: PrismaClient) {}

  async upsertStatus(
    fixtureId: string,
    umpireId: string,
    status: AssignmentStatus,
    db: DbClient = this.client,
  ): Promise<void> {
    await db.umpireAssignment.upsert({
      where: { fixtureId_umpireId: { fixtureId, umpireId } },
      create: { fixtureId, umpireId, status },
      update: { status },
    });
  }

  async find(fixtureId: string, umpireId: string): Promise<{ status: AssignmentStatus } | null> {
    return this.client.umpireAssignment.findUnique({
      where: { fixtureId_umpireId: { fixtureId, umpireId } },
      select: { status: true },
    });
  }

  async setStatus(
    fixtureId: string,
    umpireId: string,
    status: AssignmentStatus,
    db: DbClient = this.client,
  ): Promise<void> {
    try {
      await db.umpireAssignment.update({
        where: { fixtureId_umpireId: { fixtureId, umpireId } },
        data: { status },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('Assignment not found');
      }
      throw err;
    }
  }

  async acceptedSlots(umpireId: string, db: DbClient = this.client): Promise<AcceptedSlot[]> {
    const rows = await db.umpireAssignment.findMany({
      where: { umpireId, status: 'accepted' },
      include: { fixture: { select: { id: true, startsAt: true, durationMinutes: true } } },
    });
    return rows.map((r) => ({
      fixtureId: r.fixture.id,
      startsAt: r.fixture.startsAt,
      durationMinutes: r.fixture.durationMinutes,
    }));
  }

  async scheduleFor(umpireId: string): Promise<UmpireScheduleRow[]> {
    const rows = await this.client.umpireAssignment.findMany({
      where: { umpireId, status: 'accepted' },
      include: {
        fixture: {
          include: {
            tournament: { select: { name: true } },
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
            ground: { select: { name: true } },
          },
        },
      },
      orderBy: { fixture: { startsAt: 'asc' } },
    });
    return rows.map((r) => ({
      fixtureId: r.fixture.id,
      tournamentName: r.fixture.tournament.name,
      homeTeamName: r.fixture.homeTeam.name,
      awayTeamName: r.fixture.awayTeam.name,
      groundName: r.fixture.ground?.name ?? null,
      startsAt: r.fixture.startsAt,
      durationMinutes: r.fixture.durationMinutes,
    }));
  }
}
