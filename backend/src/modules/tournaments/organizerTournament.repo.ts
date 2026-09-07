import {
  Prisma,
  type PrismaClient,
  type TournamentGenderCategory,
  type TournamentNotifyAudience,
  type TournamentStatus,
  type TournamentStructure,
  type TeamSelectionMode,
} from '@prisma/client';
import type { DbClient } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';

export interface OrganizerTournamentAgeGroupRow {
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

export interface OrganizerTournamentRow {
  id: string;
  name: string;
  description: string | null;
  structure: TournamentStructure;
  teamSelectionMode: TeamSelectionMode;
  ageGroups: OrganizerTournamentAgeGroupRow[];
  startDate: Date;
  endDate: Date;
  capacity: number | null;
  registeredCount: number;
  rules: string | null;
  rulesDocumentKey: string | null;
  prizePoolAmount: number | null;
  prizePoolDescription: string | null;
  locationCity: string | null;
  locationState: string | null;
  surfaceTypeId: string | null;
  maxMarqueePlayers: number | null;
  notifyOnPublish: boolean;
  notifyAudiences: TournamentNotifyAudience[];
  notifyState: string | null;
  notifiedAt: Date | null;
  status: TournamentStatus;
  organizerId: string;
  createdAt: Date;
}

export interface TournamentAgeGroupWrite {
  ageGroupId: string;
  bornAfter: Date | null;
  bornBefore: Date | null;
  genderCategory: TournamentGenderCategory;
  registrationStartDate: Date;
  registrationEndDate: Date;
  capacity: number | null;
  format: string;
  entryFee: number | null;
  oversPerInnings: number | null;
}

export interface TournamentScalarWrite {
  name: string;
  description: string | null;
  structure: TournamentStructure;
  teamSelectionMode: TeamSelectionMode;
  startDate: Date;
  endDate: Date;
  capacity: number | null;
  rules: string | null;
  rulesDocumentKey: string | null;
  prizePoolAmount: number | null;
  prizePoolDescription: string | null;
  locationCity: string | null;
  locationState: string | null;
  surfaceTypeId: string | null;
  maxMarqueePlayers: number | null;
  notifyOnPublish: boolean;
  notifyAudiences: TournamentNotifyAudience[];
  notifyState: string | null;
}

export interface TournamentCreateWrite extends TournamentScalarWrite {
  ageGroups: TournamentAgeGroupWrite[];
}

export interface TournamentUpdateWrite extends Partial<TournamentScalarWrite> {
  ageGroups?: TournamentAgeGroupWrite[];
}

const include = {
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
  registrations: {
    where: { status: 'active' as const },
    select: { teamId: true, userId: true },
  },
} satisfies Prisma.TournamentInclude;

type TournamentWithRelations = Prisma.TournamentGetPayload<{ include: typeof include }>;

function toRow(t: TournamentWithRelations): OrganizerTournamentRow {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    structure: t.structure,
    teamSelectionMode: t.teamSelectionMode,
    ageGroups: t.ageGroups.map((g) => ({
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
        t.teamSelectionMode === 'draft_based'
          ? g.registrations.filter((r) => r.userId != null).length
          : g.registrations.filter((r) => r.teamId != null).length,
    })),
    startDate: t.startDate,
    endDate: t.endDate,
    capacity: t.capacity,
    registeredCount:
      t.teamSelectionMode === 'draft_based'
        ? t.registrations.filter((r) => r.userId != null).length
        : t.registrations.filter((r) => r.teamId != null).length,
    rules: t.rules,
    rulesDocumentKey: t.rulesDocumentKey,
    prizePoolAmount: t.prizePoolAmount != null ? Number(t.prizePoolAmount) : null,
    prizePoolDescription: t.prizePoolDescription,
    locationCity: t.locationCity,
    locationState: t.locationState,
    surfaceTypeId: t.surfaceTypeId,
    maxMarqueePlayers: t.maxMarqueePlayers,
    notifyOnPublish: t.notifyOnPublish,
    notifyAudiences: t.notifyAudiences,
    notifyState: t.notifyState,
    notifiedAt: t.notifiedAt,
    status: t.status,
    organizerId: t.organizerId,
    createdAt: t.createdAt,
  };
}

export interface OrganizerTournamentRepoPort {
  create(
    organizerId: string,
    data: TournamentCreateWrite,
    db?: DbClient,
  ): Promise<OrganizerTournamentRow>;
  findById(id: string): Promise<OrganizerTournamentRow | null>;
  listByOrganizer(organizerId: string): Promise<OrganizerTournamentRow[]>;
  update(id: string, data: TournamentUpdateWrite, db?: DbClient): Promise<OrganizerTournamentRow>;
  updateStatus(
    id: string,
    status: TournamentStatus,
    db?: DbClient,
  ): Promise<OrganizerTournamentRow>;
  markNotified(id: string, db?: DbClient): Promise<OrganizerTournamentRow>;
  setRulesDocumentKey(
    id: string,
    key: string | null,
    db?: DbClient,
  ): Promise<OrganizerTournamentRow>;
  delete(id: string, db?: DbClient): Promise<void>;
}

export class PrismaOrganizerTournamentRepo implements OrganizerTournamentRepoPort {
  constructor(private readonly client: PrismaClient) {}

  async create(
    organizerId: string,
    data: TournamentCreateWrite,
    db: DbClient = this.client,
  ): Promise<OrganizerTournamentRow> {
    const { ageGroups, ...scalars } = data;
    const row = await db.tournament.create({
      data: {
        ...scalars,
        organizerId,
        status: 'draft',
        ageGroups: { create: ageGroups.map((ag) => ({ ...ag })) },
      },
      include,
    });
    return toRow(row);
  }

  async findById(id: string): Promise<OrganizerTournamentRow | null> {
    const row = await this.client.tournament.findUnique({ where: { id }, include });
    return row ? toRow(row) : null;
  }

  async listByOrganizer(organizerId: string): Promise<OrganizerTournamentRow[]> {
    const rows = await this.client.tournament.findMany({
      where: { organizerId },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRow);
  }

  async update(
    id: string,
    data: TournamentUpdateWrite,
    db: DbClient = this.client,
  ): Promise<OrganizerTournamentRow> {
    const { ageGroups, ...scalars } = data;
    try {
      if (ageGroups) {
        await db.tournamentAgeGroup.deleteMany({ where: { tournamentId: id } });
        await db.tournamentAgeGroup.createMany({
          data: ageGroups.map((ag) => ({ ...ag, tournamentId: id })),
        });
      }
      const row = await db.tournament.update({ where: { id }, data: scalars, include });
      return toRow(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('Tournament not found');
      }
      throw err;
    }
  }

  async updateStatus(
    id: string,
    status: TournamentStatus,
    db: DbClient = this.client,
  ): Promise<OrganizerTournamentRow> {
    const row = await db.tournament.update({ where: { id }, data: { status }, include });
    return toRow(row);
  }

  async markNotified(id: string, db: DbClient = this.client): Promise<OrganizerTournamentRow> {
    const row = await db.tournament.update({
      where: { id },
      data: { notifiedAt: new Date() },
      include,
    });
    return toRow(row);
  }

  async setRulesDocumentKey(
    id: string,
    key: string | null,
    db: DbClient = this.client,
  ): Promise<OrganizerTournamentRow> {
    const row = await db.tournament.update({
      where: { id },
      data: { rulesDocumentKey: key },
      include,
    });
    return toRow(row);
  }

  async delete(id: string, db: DbClient = this.client): Promise<void> {
    try {
      await db.tournament.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('Tournament not found');
      }
      throw err;
    }
  }
}
