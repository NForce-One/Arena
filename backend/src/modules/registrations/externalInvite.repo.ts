import type {
  ExternalInviteRole,
  ExternalInviteStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import type { DbClient } from '../../lib/db';
import { ageGroupLabel } from './tournamentInvitation.repo';

export interface ExternalInviteRow {
  id: string;
  email: string;
  role: ExternalInviteRole;
  tournamentId: string | null;
  tournamentName: string | null;
  tournamentAgeGroupId: string | null;
  ageGroupLabel: string | null;
  invitedByOrganizerId: string;
  status: ExternalInviteStatus;
  claimedByUserId: string | null;
  teamInviteFiredAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

export type ExternalInviteClaimResult =
  | {
      outcome: 'claimed';
      invite: {
        id: string;
        email: string;
        role: ExternalInviteRole;
        tournamentId: string | null;
        tournamentName: string | null;
        tournamentAgeGroupId: string | null;
        invitedByOrganizerId: string;
      };
    }
  | { outcome: 'used' }
  | { outcome: 'expired' }
  | { outcome: 'invalid' };

const include = {
  tournament: { select: { name: true } },
  tournamentAgeGroup: { select: { ageGroup: { select: { name: true } }, genderCategory: true } },
} satisfies Prisma.ExternalInviteInclude;

type RowWithLabel = Prisma.ExternalInviteGetPayload<{ include: typeof include }>;

function toRow(row: RowWithLabel): ExternalInviteRow {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    tournamentId: row.tournamentId,
    tournamentName: row.tournament?.name ?? null,
    tournamentAgeGroupId: row.tournamentAgeGroupId,
    ageGroupLabel: row.tournamentAgeGroup
      ? ageGroupLabel(row.tournamentAgeGroup.ageGroup.name, row.tournamentAgeGroup.genderCategory)
      : null,
    invitedByOrganizerId: row.invitedByOrganizerId,
    status: row.status,
    claimedByUserId: row.claimedByUserId,
    teamInviteFiredAt: row.teamInviteFiredAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export interface ExternalInviteRepoPort {
  findPending(
    email: string,
    role: ExternalInviteRole,
    tournamentAgeGroupId: string | null,
  ): Promise<ExternalInviteRow | null>;
  create(data: {
    email: string;
    role: ExternalInviteRole;
    tournamentId: string | null;
    tournamentAgeGroupId: string | null;
    invitedByOrganizerId: string;
    tokenHash: string;
    expiresAt: Date;
    status?: ExternalInviteStatus;
    claimedByUserId?: string | null;
  }): Promise<ExternalInviteRow>;
  reissue(id: string, data: { tokenHash: string; expiresAt: Date }): Promise<ExternalInviteRow>;
  findByTokenHash(tokenHash: string): Promise<ExternalInviteRow | null>;
  claim(tokenHash: string, db?: DbClient): Promise<ExternalInviteClaimResult>;
  recordClaimedBy(id: string, userId: string, db?: DbClient): Promise<void>;
  listForTournament(tournamentId: string): Promise<ExternalInviteRow[]>;
  findUnconsumedTeamManagerInvites(userId: string): Promise<ExternalInviteRow[]>;
  markTeamInviteFired(id: string): Promise<void>;
}

export class PrismaExternalInviteRepo implements ExternalInviteRepoPort {
  constructor(private readonly client: PrismaClient) {}

  async findPending(
    email: string,
    role: ExternalInviteRole,
    tournamentAgeGroupId: string | null,
  ): Promise<ExternalInviteRow | null> {
    const row = await this.client.externalInvite.findFirst({
      where: { email, role, tournamentAgeGroupId, status: 'pending' },
      include,
    });
    return row ? toRow(row) : null;
  }

  async create(data: {
    email: string;
    role: ExternalInviteRole;
    tournamentId: string | null;
    tournamentAgeGroupId: string | null;
    invitedByOrganizerId: string;
    tokenHash: string;
    expiresAt: Date;
    status?: ExternalInviteStatus;
    claimedByUserId?: string | null;
  }): Promise<ExternalInviteRow> {
    const row = await this.client.externalInvite.create({ data, include });
    return toRow(row);
  }

  async reissue(
    id: string,
    data: { tokenHash: string; expiresAt: Date },
  ): Promise<ExternalInviteRow> {
    const row = await this.client.externalInvite.update({ where: { id }, data, include });
    return toRow(row);
  }

  async findByTokenHash(tokenHash: string): Promise<ExternalInviteRow | null> {
    const row = await this.client.externalInvite.findUnique({ where: { tokenHash }, include });
    return row ? toRow(row) : null;
  }

  async claim(tokenHash: string, db: DbClient = this.client): Promise<ExternalInviteClaimResult> {
    const updated = await db.externalInvite.updateMany({
      where: { tokenHash, status: 'pending', expiresAt: { gt: new Date() } },
      data: { status: 'fulfilled' },
    });
    if (updated.count === 1) {
      const row = await db.externalInvite.findUnique({
        where: { tokenHash },
        include: { tournament: { select: { name: true } } },
      });
      if (!row) return { outcome: 'invalid' };
      return {
        outcome: 'claimed',
        invite: {
          id: row.id,
          email: row.email,
          role: row.role,
          tournamentId: row.tournamentId,
          tournamentName: row.tournament?.name ?? null,
          tournamentAgeGroupId: row.tournamentAgeGroupId,
          invitedByOrganizerId: row.invitedByOrganizerId,
        },
      };
    }
    const row = await db.externalInvite.findUnique({ where: { tokenHash } });
    if (!row) return { outcome: 'invalid' };
    if (row.status === 'fulfilled') return { outcome: 'used' };
    return { outcome: 'expired' };
  }

  async recordClaimedBy(id: string, userId: string, db: DbClient = this.client): Promise<void> {
    await db.externalInvite.update({ where: { id }, data: { claimedByUserId: userId } });
  }

  async listForTournament(tournamentId: string): Promise<ExternalInviteRow[]> {
    const rows = await this.client.externalInvite.findMany({
      where: { tournamentId },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRow);
  }

  async findUnconsumedTeamManagerInvites(userId: string): Promise<ExternalInviteRow[]> {
    const rows = await this.client.externalInvite.findMany({
      where: {
        claimedByUserId: userId,
        role: 'team_manager',
        status: 'fulfilled',
        tournamentId: { not: null },
        tournamentAgeGroupId: { not: null },
        teamInviteFiredAt: null,
      },
      include,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRow);
  }

  async markTeamInviteFired(id: string): Promise<void> {
    await this.client.externalInvite.update({
      where: { id },
      data: { teamInviteFiredAt: new Date() },
    });
  }
}
