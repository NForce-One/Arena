import { Prisma, type PrismaClient, type TournamentInvitationStatus } from '@prisma/client';
import { TOURNAMENT_GENDER_CATEGORY_LABELS, type TournamentGenderCategory } from '@nforce/shared';
import { ConflictError, NotFoundError } from '../../lib/errors';

export interface TournamentInvitationRow {
  id: string;
  tournamentId: string;
  tournamentName: string;
  entityType: 'team' | 'player';
  entityId: string;
  entityName: string;
  eligibilityOverridden: boolean;
  windowOverridden: boolean;
  capacityOverridden: boolean;
  tournamentAgeGroupId: string;
  ageGroupLabel: string;
  status: TournamentInvitationStatus;
  createdAt: Date;
}

const include = {
  tournament: { select: { name: true } },
  team: { select: { name: true, managerId: true } },
  user: { select: { name: true } },
  tournamentAgeGroup: { select: { ageGroup: { select: { name: true } }, genderCategory: true } },
} satisfies Prisma.TournamentInvitationInclude;

type RowWithLabel = Prisma.TournamentInvitationGetPayload<{ include: typeof include }>;

function toRow(row: RowWithLabel): TournamentInvitationRow {
  const entityType: 'team' | 'player' = row.teamId ? 'team' : 'player';
  return {
    id: row.id,
    tournamentId: row.tournamentId,
    tournamentName: row.tournament.name,
    entityType,
    entityId: (row.teamId ?? row.userId)!,
    entityName: row.team?.name ?? row.user?.name ?? 'Unknown',
    eligibilityOverridden: row.eligibilityOverridden,
    windowOverridden: row.windowOverridden,
    capacityOverridden: row.capacityOverridden,
    tournamentAgeGroupId: row.tournamentAgeGroupId,
    ageGroupLabel: ageGroupLabel(
      row.tournamentAgeGroup.ageGroup.name,
      row.tournamentAgeGroup.genderCategory,
    ),
    status: row.status,
    createdAt: row.createdAt,
  };
}

export function ageGroupLabel(name: string, genderCategory: TournamentGenderCategory): string {
  return `${name} · ${TOURNAMENT_GENDER_CATEGORY_LABELS[genderCategory]}`;
}

export interface TournamentInvitationRepoPort {
  createForTeam(
    tournamentId: string,
    teamId: string,
    tournamentAgeGroupId: string,
    invitedById: string,
    windowOverridden: boolean,
    eligibilityOverridden: boolean,
    capacityOverridden: boolean,
  ): Promise<TournamentInvitationRow>;
  createForUser(
    tournamentId: string,
    userId: string,
    tournamentAgeGroupId: string,
    invitedById: string,
    eligibilityOverridden: boolean,
    windowOverridden: boolean,
    capacityOverridden: boolean,
  ): Promise<TournamentInvitationRow>;
  findById(id: string): Promise<TournamentInvitationRow | null>;
  listForTournament(tournamentId: string): Promise<TournamentInvitationRow[]>;
  listForTeam(teamId: string): Promise<TournamentInvitationRow[]>;
  listForUser(userId: string): Promise<TournamentInvitationRow[]>;
  findPendingForUserAndTournament(
    userId: string,
    tournamentId: string,
  ): Promise<TournamentInvitationRow | null>;
  updateStatus(id: string, status: TournamentInvitationStatus): Promise<void>;
  claimResponse(
    id: string,
    toStatus: 'accepted' | 'declined',
  ): Promise<TournamentInvitationRow | null>;
}

export class PrismaTournamentInvitationRepo implements TournamentInvitationRepoPort {
  constructor(private readonly client: PrismaClient) {}

  async createForTeam(
    tournamentId: string,
    teamId: string,
    tournamentAgeGroupId: string,
    invitedById: string,
    windowOverridden: boolean,
    eligibilityOverridden: boolean,
    capacityOverridden: boolean,
  ): Promise<TournamentInvitationRow> {
    try {
      const row = await this.client.tournamentInvitation.create({
        data: {
          tournamentId,
          teamId,
          tournamentAgeGroupId,
          invitedById,
          windowOverridden,
          eligibilityOverridden,
          capacityOverridden,
        },
        include,
      });
      return toRow(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('This team already has a pending invitation.', 'INVITE_PENDING');
      }
      throw err;
    }
  }

  async createForUser(
    tournamentId: string,
    userId: string,
    tournamentAgeGroupId: string,
    invitedById: string,
    eligibilityOverridden: boolean,
    windowOverridden: boolean,
    capacityOverridden: boolean,
  ): Promise<TournamentInvitationRow> {
    try {
      const row = await this.client.tournamentInvitation.create({
        data: {
          tournamentId,
          userId,
          tournamentAgeGroupId,
          invitedById,
          eligibilityOverridden,
          windowOverridden,
          capacityOverridden,
        },
        include,
      });
      return toRow(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('This player already has a pending invitation.', 'INVITE_PENDING');
      }
      throw err;
    }
  }

  async findById(id: string): Promise<TournamentInvitationRow | null> {
    const row = await this.client.tournamentInvitation.findUnique({ where: { id }, include });
    return row ? toRow(row) : null;
  }

  async listForTournament(tournamentId: string): Promise<TournamentInvitationRow[]> {
    const rows = await this.client.tournamentInvitation.findMany({
      where: { tournamentId },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRow);
  }

  async listForTeam(teamId: string): Promise<TournamentInvitationRow[]> {
    const rows = await this.client.tournamentInvitation.findMany({
      where: { teamId, status: 'invited' },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRow);
  }

  async listForUser(userId: string): Promise<TournamentInvitationRow[]> {
    const rows = await this.client.tournamentInvitation.findMany({
      where: { userId, status: 'invited' },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRow);
  }

  async findPendingForUserAndTournament(
    userId: string,
    tournamentId: string,
  ): Promise<TournamentInvitationRow | null> {
    const row = await this.client.tournamentInvitation.findFirst({
      where: { userId, tournamentId, status: 'invited' },
      include,
    });
    return row ? toRow(row) : null;
  }

  async updateStatus(id: string, status: TournamentInvitationStatus): Promise<void> {
    try {
      await this.client.tournamentInvitation.update({ where: { id }, data: { status } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('Invitation not found');
      }
      throw err;
    }
  }

  async claimResponse(
    id: string,
    toStatus: 'accepted' | 'declined',
  ): Promise<TournamentInvitationRow | null> {
    const { count } = await this.client.tournamentInvitation.updateMany({
      where: { id, status: 'invited' },
      data: { status: toStatus },
    });
    if (count === 0) return null;
    return this.findById(id);
  }
}
