import {
  Prisma,
  type PrismaClient,
  type RegistrationStatus,
  type TournamentStatus,
} from '@prisma/client';
import {
  TOURNAMENT_GENDER_CATEGORY_LABELS,
  type PaymentStatusValue,
  type TeamSelectionMode,
  type TournamentGenderCategory,
} from '@nforce/shared';
import type { DbClient } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';

export interface RegistrationPaymentRow {
  registrationId: string;
  userId: string;
  status: PaymentStatusValue;
  amountPaid: number | null;
}

export interface TournamentAgeGroupBracket {
  id: string;
  bornAfter: Date | null;
  bornBefore: Date | null;
  genderCategory: TournamentGenderCategory;
  registrationStartDate: Date;
  registrationEndDate: Date;
  capacity: number | null;
}

export interface RegistrationEligibilityInfo {
  status: TournamentStatus;
  startDate: Date;
  teamSelectionMode: TeamSelectionMode;
  ageGroups: TournamentAgeGroupBracket[];
}

export interface RegistrationRow {
  id: string;
  tournamentId: string;
  tournamentAgeGroupId: string;
  ageGroupLabel: string;
  userId: string | null;
  teamId: string | null;
  entityName: string;
  status: RegistrationStatus;
  createdAt: Date;
  capacityOverridden: boolean;
  teamPaymentStatus: PaymentStatusValue;
  teamPaymentAmountPaid: number | null;
}

export interface RegistrationEntity {
  userId?: string;
  teamId?: string;
  tournamentAgeGroupId: string;
  capacityOverridden?: boolean;
}

export interface FamilyRegistrationRow extends RegistrationRow {
  tournamentName: string;
}

export interface RegistrationRepoPort {
  findTournamentInfo(tournamentId: string): Promise<RegistrationEligibilityInfo | null>;
  countActive(
    tournamentAgeGroupId: string,
    entityType: 'team' | 'player',
    db?: DbClient,
  ): Promise<number>;
  create(tournamentId: string, entity: RegistrationEntity, db?: DbClient): Promise<{ id: string }>;
  findById(id: string): Promise<RegistrationRow | null>;
  withdraw(id: string, db?: DbClient): Promise<void>;
  listForTournament(tournamentId: string): Promise<RegistrationRow[]>;
  listActiveForUsers(userIds: string[]): Promise<FamilyRegistrationRow[]>;
  findOverlappingIndividualRegistrations(
    userId: string,
    teamId: string,
    db?: DbClient,
  ): Promise<RegistrationRow[]>;
  isTeamRegisteredUnderOrganizer(teamId: string, organizerId: string): Promise<boolean>;
  listUserAndManagerIdsRegisteredInYear(
    year: number,
  ): Promise<{ userIds: string[]; managerIds: string[] }>;
  listPaymentsForTournament(tournamentId: string): Promise<RegistrationPaymentRow[]>;
  findPayment(registrationId: string, userId: string): Promise<RegistrationPaymentRow | null>;
  upsertPayment(
    registrationId: string,
    userId: string,
    data: { status: PaymentStatusValue; amountPaid: number | null },
  ): Promise<void>;
  updateTeamPayment(
    registrationId: string,
    data: { status: PaymentStatusValue; amountPaid: number | null },
  ): Promise<void>;
}

function ageGroupLabel(name: string, genderCategory: TournamentGenderCategory): string {
  return `${name} · ${TOURNAMENT_GENDER_CATEGORY_LABELS[genderCategory]}`;
}

const registrationInclude = {
  user: { select: { name: true } },
  team: { select: { name: true } },
  tournamentAgeGroup: { select: { ageGroup: { select: { name: true } }, genderCategory: true } },
} satisfies Prisma.RegistrationInclude;

type RegistrationWithLabel = Prisma.RegistrationGetPayload<{ include: typeof registrationInclude }>;

function toRow(row: RegistrationWithLabel): RegistrationRow {
  return {
    id: row.id,
    tournamentId: row.tournamentId,
    tournamentAgeGroupId: row.tournamentAgeGroupId,
    ageGroupLabel: ageGroupLabel(
      row.tournamentAgeGroup.ageGroup.name,
      row.tournamentAgeGroup.genderCategory,
    ),
    userId: row.userId,
    teamId: row.teamId,
    entityName: row.user?.name ?? row.team?.name ?? 'Unknown',
    status: row.status,
    createdAt: row.createdAt,
    capacityOverridden: row.capacityOverridden,
    teamPaymentStatus: row.teamPaymentStatus,
    teamPaymentAmountPaid:
      row.teamPaymentAmountPaid != null ? Number(row.teamPaymentAmountPaid) : null,
  };
}

export class PrismaRegistrationRepo implements RegistrationRepoPort {
  constructor(private readonly client: PrismaClient) {}

  async findTournamentInfo(tournamentId: string): Promise<RegistrationEligibilityInfo | null> {
    const t = await this.client.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        status: true,
        startDate: true,
        teamSelectionMode: true,
        ageGroups: {
          select: {
            id: true,
            bornAfter: true,
            bornBefore: true,
            genderCategory: true,
            registrationStartDate: true,
            registrationEndDate: true,
            capacity: true,
          },
        },
      },
    });
    if (!t) return null;
    return {
      status: t.status,
      startDate: t.startDate,
      teamSelectionMode: t.teamSelectionMode,
      ageGroups: t.ageGroups,
    };
  }

  countActive(
    tournamentAgeGroupId: string,
    entityType: 'team' | 'player',
    db: DbClient = this.client,
  ): Promise<number> {
    return db.registration.count({
      where: {
        tournamentAgeGroupId,
        status: 'active',
        ...(entityType === 'team' ? { teamId: { not: null } } : { userId: { not: null } }),
      },
    });
  }

  async create(
    tournamentId: string,
    entity: RegistrationEntity,
    db: DbClient = this.client,
  ): Promise<{ id: string }> {
    const row = await db.registration.create({
      data: {
        tournamentId,
        tournamentAgeGroupId: entity.tournamentAgeGroupId,
        userId: entity.userId ?? null,
        teamId: entity.teamId ?? null,
        status: 'active',
        capacityOverridden: entity.capacityOverridden ?? false,
      },
      select: { id: true },
    });
    return row;
  }

  async findById(id: string): Promise<RegistrationRow | null> {
    const row = await this.client.registration.findUnique({
      where: { id },
      include: registrationInclude,
    });
    if (!row) return null;
    return toRow(row);
  }

  async withdraw(id: string, db: DbClient = this.client): Promise<void> {
    try {
      await db.registration.update({ where: { id }, data: { status: 'withdrawn' } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('Registration not found');
      }
      throw err;
    }
  }

  async listForTournament(tournamentId: string): Promise<RegistrationRow[]> {
    const rows = await this.client.registration.findMany({
      where: { tournamentId },
      include: registrationInclude,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRow);
  }

  async listActiveForUsers(userIds: string[]): Promise<FamilyRegistrationRow[]> {
    if (userIds.length === 0) return [];
    const rows = await this.client.registration.findMany({
      where: { userId: { in: userIds }, status: 'active' },
      include: { ...registrationInclude, tournament: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({ ...toRow(row), tournamentName: row.tournament.name }));
  }

  async listUserAndManagerIdsRegisteredInYear(
    year: number,
  ): Promise<{ userIds: string[]; managerIds: string[] }> {
    const rows = await this.client.registration.findMany({
      where: {
        status: 'active',
        tournament: {
          startDate: {
            gte: new Date(Date.UTC(year, 0, 1)),
            lt: new Date(Date.UTC(year + 1, 0, 1)),
          },
        },
      },
      select: { userId: true, team: { select: { managerId: true } } },
    });
    const userIds = new Set<string>();
    const managerIds = new Set<string>();
    for (const row of rows) {
      if (row.userId) userIds.add(row.userId);
      if (row.team) managerIds.add(row.team.managerId);
    }
    return { userIds: [...userIds], managerIds: [...managerIds] };
  }

  async findOverlappingIndividualRegistrations(
    userId: string,
    teamId: string,
    db: DbClient = this.client,
  ): Promise<RegistrationRow[]> {
    const teamRegs = await db.registration.findMany({
      where: { teamId, status: 'active' },
      select: { tournamentAgeGroupId: true },
    });
    if (teamRegs.length === 0) return [];
    const rows = await db.registration.findMany({
      where: {
        userId,
        status: 'active',
        tournamentAgeGroupId: { in: teamRegs.map((r) => r.tournamentAgeGroupId) },
      },
      include: registrationInclude,
    });
    return rows.map(toRow);
  }

  async isTeamRegisteredUnderOrganizer(teamId: string, organizerId: string): Promise<boolean> {
    const row = await this.client.registration.findFirst({
      where: { teamId, status: 'active', tournament: { organizerId } },
      select: { id: true },
    });
    return row !== null;
  }

  async listPaymentsForTournament(tournamentId: string): Promise<RegistrationPaymentRow[]> {
    const rows = await this.client.registrationPlayerPayment.findMany({
      where: { registration: { tournamentId } },
    });
    return rows.map((r) => ({
      registrationId: r.registrationId,
      userId: r.userId,
      status: r.paymentStatus,
      amountPaid: r.paymentAmountPaid != null ? Number(r.paymentAmountPaid) : null,
    }));
  }

  async findPayment(
    registrationId: string,
    userId: string,
  ): Promise<RegistrationPaymentRow | null> {
    const row = await this.client.registrationPlayerPayment.findUnique({
      where: { registrationId_userId: { registrationId, userId } },
    });
    if (!row) return null;
    return {
      registrationId: row.registrationId,
      userId: row.userId,
      status: row.paymentStatus,
      amountPaid: row.paymentAmountPaid != null ? Number(row.paymentAmountPaid) : null,
    };
  }

  async upsertPayment(
    registrationId: string,
    userId: string,
    data: { status: PaymentStatusValue; amountPaid: number | null },
  ): Promise<void> {
    try {
      await this.client.registrationPlayerPayment.upsert({
        where: { registrationId_userId: { registrationId, userId } },
        create: {
          registrationId,
          userId,
          paymentStatus: data.status,
          paymentAmountPaid: data.amountPaid,
        },
        update: { paymentStatus: data.status, paymentAmountPaid: data.amountPaid },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new NotFoundError('Registration or player not found');
      }
      throw err;
    }
  }

  async updateTeamPayment(
    registrationId: string,
    data: { status: PaymentStatusValue; amountPaid: number | null },
  ): Promise<void> {
    try {
      await this.client.registration.update({
        where: { id: registrationId },
        data: { teamPaymentStatus: data.status, teamPaymentAmountPaid: data.amountPaid },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('Registration not found');
      }
      throw err;
    }
  }
}
