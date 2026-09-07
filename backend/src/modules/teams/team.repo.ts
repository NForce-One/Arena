import { Prisma, type PrismaClient, type TeamRole, type TeamRosterStatus } from '@prisma/client';
import type { DbClient } from '../../lib/db';
import { ConflictError, NotFoundError } from '../../lib/errors';

export interface RosterMemberRow {
  userId: string;
  name: string;
  email: string;
  isManagedChild: boolean;
  managedByParentName: string | null;
  roleInTeam: TeamRole;
  status: TeamRosterStatus;
  joinedAt: Date;
}

export interface TeamRow {
  id: string;
  name: string;
  managerId: string;
  managerName: string;
  managerAcademyName: string | null;
  roster: RosterMemberRow[];
  draftTournamentAgeGroupId: string | null;
}

export interface MyInvitationRow {
  teamId: string;
  teamName: string;
  roleInTeam: TeamRole;
}

const include = {
  manager: { select: { name: true, academyName: true } },
  roster: {
    include: { user: { select: { name: true, email: true, parent: { select: { name: true } } } } },
  },
} as const;

function toRow(t: {
  id: string;
  name: string;
  managerId: string;
  manager: { name: string; academyName: string | null };
  draftTournamentAgeGroupId: string | null;
  roster: {
    userId: string;
    roleInTeam: TeamRole;
    status: TeamRosterStatus;
    joinedAt: Date;
    user: { name: string; email: string; parent: { name: string } | null };
  }[];
}): TeamRow {
  return {
    id: t.id,
    name: t.name,
    managerId: t.managerId,
    managerName: t.manager.name,
    managerAcademyName: t.manager.academyName,
    draftTournamentAgeGroupId: t.draftTournamentAgeGroupId,
    roster: t.roster.map((r) => ({
      userId: r.userId,
      name: r.user.name,
      email: r.user.email,
      isManagedChild: !!r.user.parent,
      managedByParentName: r.user.parent?.name ?? null,
      roleInTeam: r.roleInTeam,
      status: r.status,
      joinedAt: r.joinedAt,
    })),
  };
}

export interface TeamSearchResult {
  id: string;
  name: string;
  managerName: string;
}

export interface TeamRepoPort {
  create(managerId: string, name: string): Promise<TeamRow>;
  createDraft(managerId: string, name: string, tournamentAgeGroupId: string): Promise<TeamRow>;
  listDraftTeamsForAgeGroup(tournamentAgeGroupId: string): Promise<TeamRow[]>;
  findById(id: string): Promise<TeamRow | null>;
  listByManager(managerId: string): Promise<TeamRow[]>;
  searchByName(query: string): Promise<TeamSearchResult[]>;
  update(id: string, name: string): Promise<TeamRow>;
  addRosterEntry(teamId: string, userId: string, roleInTeam: TeamRole): Promise<void>;
  addAcceptedRosterEntry(teamId: string, userId: string, roleInTeam: TeamRole): Promise<void>;
  requestToJoin(teamId: string, userId: string, roleInTeam: TeamRole): Promise<void>;
  findRosterEntry(teamId: string, userId: string): Promise<{ status: TeamRosterStatus } | null>;
  setRosterStatus(
    teamId: string,
    userId: string,
    status: TeamRosterStatus,
    db?: DbClient,
  ): Promise<void>;
  removeRosterEntry(teamId: string, userId: string, db?: DbClient): Promise<void>;
  listInvitationsForUser(userId: string): Promise<MyInvitationRow[]>;
  listAcceptedTeamIdsForUser(userId: string): Promise<string[]>;
}

export class PrismaTeamRepo implements TeamRepoPort {
  constructor(private readonly client: PrismaClient) {}

  async create(managerId: string, name: string): Promise<TeamRow> {
    const row = await this.client.team.create({ data: { name, managerId }, include });
    return toRow(row);
  }

  async createDraft(
    managerId: string,
    name: string,
    tournamentAgeGroupId: string,
  ): Promise<TeamRow> {
    const row = await this.client.team.create({
      data: { name, managerId, draftTournamentAgeGroupId: tournamentAgeGroupId },
      include,
    });
    return toRow(row);
  }

  async listDraftTeamsForAgeGroup(tournamentAgeGroupId: string): Promise<TeamRow[]> {
    const rows = await this.client.team.findMany({
      where: { draftTournamentAgeGroupId: tournamentAgeGroupId },
      include,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRow);
  }

  async findById(id: string): Promise<TeamRow | null> {
    const row = await this.client.team.findUnique({ where: { id }, include });
    return row ? toRow(row) : null;
  }

  async listByManager(managerId: string): Promise<TeamRow[]> {
    const rows = await this.client.team.findMany({
      where: { managerId },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRow);
  }

  async searchByName(query: string): Promise<TeamSearchResult[]> {
    const rows = await this.client.team.findMany({
      where: { name: { contains: query, mode: 'insensitive' } },
      include: { manager: { select: { name: true } } },
      take: 10,
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, managerName: r.manager.name }));
  }

  async update(id: string, name: string): Promise<TeamRow> {
    try {
      const row = await this.client.team.update({ where: { id }, data: { name }, include });
      return toRow(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('Team not found');
      }
      throw err;
    }
  }

  async addRosterEntry(teamId: string, userId: string, roleInTeam: TeamRole): Promise<void> {
    const existing = await this.client.teamRosterEntry.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { status: true },
    });
    if (existing) {
      if (existing.status !== 'declined') {
        throw new ConflictError('This player is already on the roster.', 'ALREADY_ON_ROSTER');
      }
      await this.client.teamRosterEntry.update({
        where: { teamId_userId: { teamId, userId } },
        data: { roleInTeam, status: 'invited', joinedAt: new Date() },
      });
      return;
    }
    try {
      await this.client.teamRosterEntry.create({
        data: { teamId, userId, roleInTeam, status: 'invited' },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('This player is already on the roster.', 'ALREADY_ON_ROSTER');
      }
      throw err;
    }
  }

  async addAcceptedRosterEntry(
    teamId: string,
    userId: string,
    roleInTeam: TeamRole,
  ): Promise<void> {
    try {
      await this.client.teamRosterEntry.create({
        data: { teamId, userId, roleInTeam, status: 'accepted' },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('This player is already on the roster.', 'ALREADY_ON_ROSTER');
      }
      throw err;
    }
  }

  async requestToJoin(teamId: string, userId: string, roleInTeam: TeamRole): Promise<void> {
    const existing = await this.client.teamRosterEntry.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { status: true },
    });
    if (existing) {
      if (existing.status !== 'declined') {
        throw new ConflictError('This player is already on the roster.', 'ALREADY_ON_ROSTER');
      }
      await this.client.teamRosterEntry.update({
        where: { teamId_userId: { teamId, userId } },
        data: { roleInTeam, status: 'requested', joinedAt: new Date() },
      });
      return;
    }
    try {
      await this.client.teamRosterEntry.create({
        data: { teamId, userId, roleInTeam, status: 'requested' },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('This player is already on the roster.', 'ALREADY_ON_ROSTER');
      }
      throw err;
    }
  }

  async findRosterEntry(
    teamId: string,
    userId: string,
  ): Promise<{ status: TeamRosterStatus } | null> {
    const row = await this.client.teamRosterEntry.findUnique({
      where: { teamId_userId: { teamId, userId } },
      select: { status: true },
    });
    return row;
  }

  async setRosterStatus(
    teamId: string,
    userId: string,
    status: TeamRosterStatus,
    db: DbClient = this.client,
  ): Promise<void> {
    await db.teamRosterEntry.update({
      where: { teamId_userId: { teamId, userId } },
      data: { status },
    });
  }

  async removeRosterEntry(
    teamId: string,
    userId: string,
    db: DbClient = this.client,
  ): Promise<void> {
    try {
      await db.teamRosterEntry.delete({ where: { teamId_userId: { teamId, userId } } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('Roster entry not found');
      }
      throw err;
    }
  }

  async listInvitationsForUser(userId: string): Promise<MyInvitationRow[]> {
    const rows = await this.client.teamRosterEntry.findMany({
      where: { userId, status: 'invited' },
      include: { team: { select: { name: true } } },
    });
    return rows.map((r) => ({ teamId: r.teamId, teamName: r.team.name, roleInTeam: r.roleInTeam }));
  }

  async listAcceptedTeamIdsForUser(userId: string): Promise<string[]> {
    const rows = await this.client.teamRosterEntry.findMany({
      where: { userId, status: 'accepted' },
      select: { teamId: true },
    });
    return rows.map((r) => r.teamId);
  }
}
