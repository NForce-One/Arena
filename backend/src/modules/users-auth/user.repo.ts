import type {
  BattingStyle,
  BowlingStyle,
  Gender,
  HeightUnit,
  JerseySize,
  PlayingRole,
  PrismaClient,
  User,
  WeightUnit,
} from '@prisma/client';
import type { RoleName } from '@nforce/shared';
import { Prisma } from '@prisma/client';
import type { DbClient } from '../../lib/db';
import { ConflictError } from '../../lib/errors';

export interface ManagedChildWithParent extends User {
  parent: { id: string; name: string; email: string } | null;
}

export interface SportsProfileUpdateData {
  phone: string | null;
  school: string | null;
  jerseyNumber: number | null;
  jerseyName: string | null;
  jerseySize: JerseySize | null;
  battingStyle: BattingStyle | null;
  battingStyleOther: string | null;
  bowlingStyle: BowlingStyle | null;
  bowlingStyleOther: string | null;
  playingRole: PlayingRole | null;
  heightValue: number | null;
  heightUnit: HeightUnit | null;
  weightValue: number | null;
  weightUnit: WeightUnit | null;
  gender: Gender | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  consentedByUserId: string;
  consentAcceptedAt: Date;
}

export interface UserDirectoryEntry {
  id: string;
  name: string;
  email: string;
  verified: boolean;
}

export interface UserRepoPort {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string, db?: DbClient): Promise<User | null>;
  create(
    data: {
      name: string;
      email: string;
      passwordHash: string;
      roleIds: number[];
      dateOfBirth?: Date;
      managedByParentId?: string;
    },
    db?: DbClient,
  ): Promise<User>;
  setVerified(userId: string, db?: DbClient): Promise<void>;
  updateProfile(
    userId: string,
    data: {
      name: string;
      dateOfBirth: Date | null;
      academyName: string | null;
      state: string | null;
    },
  ): Promise<User>;
  updateNotifyPublishStates(userId: string, states: string[]): Promise<User>;
  setPhotoKey(userId: string, photoKey: string | null): Promise<User>;
  updateSportsProfile(userId: string, data: SportsProfileUpdateData, db?: DbClient): Promise<User>;
  findTeammateWithJerseyNumber(
    userId: string,
    jerseyNumber: number,
    db?: DbClient,
  ): Promise<{ teamName: string } | null>;
  updatePassword(userId: string, passwordHash: string, db?: DbClient): Promise<void>;
  getRoleNames(userId: string, db?: DbClient): Promise<RoleName[]>;
  setClubId(userId: string, clubId: string | null, db?: DbClient): Promise<User>;
  listWithRoles(): Promise<{ user: User; roles: RoleName[] }[]>;
  searchPlayersByName(
    query: string,
  ): Promise<{ id: string; name: string; managedByParentName: string | null }[]>;
  listIds(role?: RoleName): Promise<string[]>;
  listIdsByRoleAndState(role: RoleName, state: string): Promise<string[]>;
  listIdsSubscribedToPublishState(role: RoleName, state: string): Promise<string[]>;
  listDirectoryByRole(role: RoleName): Promise<UserDirectoryEntry[]>;
  addRole(userId: string, roleId: number, db?: DbClient): Promise<void>;
  removeRole(userId: string, roleId: number, db?: DbClient): Promise<void>;

  listManagedChildren(parentId: string): Promise<User[]>;
  listAllManagedChildren(): Promise<ManagedChildWithParent[]>;
  updateChild(childId: string, data: { name: string; dateOfBirth: Date }): Promise<User>;
  setClaimInviteSentAt(
    childId: string,
    data: { at: Date; pendingClaimEmail: string },
    db?: DbClient,
  ): Promise<void>;
  claimAccount(
    childId: string,
    data: { email: string; passwordHash: string },
    db?: DbClient,
  ): Promise<User>;
  setPendingEmail(userId: string, email: string, db?: DbClient): Promise<void>;
  confirmEmailChange(userId: string, newEmail: string, db?: DbClient): Promise<User>;
}

export class PrismaUserRepo implements UserRepoPort {
  constructor(private readonly client: PrismaClient) {}

  findByEmail(email: string): Promise<User | null> {
    return this.client.user.findUnique({ where: { email } });
  }

  findById(id: string, db: DbClient = this.client): Promise<User | null> {
    return db.user.findUnique({ where: { id } });
  }

  async create(
    data: {
      name: string;
      email: string;
      passwordHash: string;
      roleIds: number[];
      dateOfBirth?: Date;
      managedByParentId?: string;
    },
    db: DbClient = this.client,
  ): Promise<User> {
    try {
      return await db.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash: data.passwordHash,
          dateOfBirth: data.dateOfBirth ?? null,
          managedByParentId: data.managedByParentId ?? null,
          roles: { create: data.roleIds.map((roleId) => ({ roleId })) },
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('This email address is already in use.', 'EMAIL_IN_USE');
      }
      throw err;
    }
  }

  async setVerified(userId: string, db: DbClient = this.client): Promise<void> {
    await db.user.update({ where: { id: userId }, data: { verified: true } });
  }

  updateProfile(
    userId: string,
    data: {
      name: string;
      dateOfBirth: Date | null;
      academyName: string | null;
      state: string | null;
    },
  ): Promise<User> {
    return this.client.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        dateOfBirth: data.dateOfBirth,
        academyName: data.academyName,
        state: data.state,
      },
    });
  }

  updateNotifyPublishStates(userId: string, states: string[]): Promise<User> {
    return this.client.user.update({
      where: { id: userId },
      data: { notifyPublishStates: states },
    });
  }

  setPhotoKey(userId: string, photoKey: string | null): Promise<User> {
    return this.client.user.update({ where: { id: userId }, data: { photoKey } });
  }

  updateSportsProfile(
    userId: string,
    data: SportsProfileUpdateData,
    db: DbClient = this.client,
  ): Promise<User> {
    return db.user.update({ where: { id: userId }, data });
  }

  async findTeammateWithJerseyNumber(
    userId: string,
    jerseyNumber: number,
    db: DbClient = this.client,
  ): Promise<{ teamName: string } | null> {
    const myTeams = await db.teamRosterEntry.findMany({
      where: { userId, status: 'accepted' },
      select: { teamId: true },
    });
    if (myTeams.length === 0) return null;
    const collision = await db.teamRosterEntry.findFirst({
      where: {
        teamId: { in: myTeams.map((t) => t.teamId) },
        userId: { not: userId },
        status: 'accepted',
        user: { jerseyNumber },
      },
      select: { team: { select: { name: true } } },
    });
    return collision ? { teamName: collision.team.name } : null;
  }

  async updatePassword(
    userId: string,
    passwordHash: string,
    db: DbClient = this.client,
  ): Promise<void> {
    await db.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: new Date() },
    });
  }

  async getRoleNames(userId: string, db: DbClient = this.client): Promise<RoleName[]> {
    const rows = await db.userRole.findMany({
      where: { userId },
      include: { role: { select: { name: true } } },
    });
    return rows.map((r) => r.role.name);
  }

  setClubId(userId: string, clubId: string | null, db: DbClient = this.client): Promise<User> {
    return db.user.update({ where: { id: userId }, data: { clubId } });
  }

  async listWithRoles(): Promise<{ user: User; roles: RoleName[] }[]> {
    const rows = await this.client.user.findMany({
      include: { roles: { include: { role: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(({ roles, ...user }) => ({ user, roles: roles.map((r) => r.role.name) }));
  }

  async listIds(role?: RoleName): Promise<string[]> {
    if (!role) {
      const rows = await this.client.user.findMany({ select: { id: true } });
      return rows.map((r) => r.id);
    }
    const rows = await this.client.userRole.findMany({
      where: { role: { name: role } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async listIdsByRoleAndState(role: RoleName, state: string): Promise<string[]> {
    const rows = await this.client.userRole.findMany({
      where: { role: { name: role }, user: { state } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async listIdsSubscribedToPublishState(role: RoleName, state: string): Promise<string[]> {
    const rows = await this.client.userRole.findMany({
      where: { role: { name: role }, user: { notifyPublishStates: { has: state } } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async listDirectoryByRole(role: RoleName): Promise<UserDirectoryEntry[]> {
    const rows = await this.client.user.findMany({
      where: { roles: { some: { role: { name: role } } } },
      select: { id: true, name: true, email: true, verified: true },
      orderBy: { name: 'asc' },
    });
    return rows;
  }

  async searchPlayersByName(
    query: string,
  ): Promise<{ id: string; name: string; managedByParentName: string | null }[]> {
    const rows = await this.client.user.findMany({
      where: {
        name: { contains: query, mode: 'insensitive' },
        roles: { some: { role: { name: 'player' } } },
      },
      select: { id: true, name: true, parent: { select: { name: true } } },
      take: 10,
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      managedByParentName: r.parent?.name ?? null,
    }));
  }

  async addRole(userId: string, roleId: number, db: DbClient = this.client): Promise<void> {
    await db.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      create: { userId, roleId },
      update: {},
    });
  }

  async removeRole(userId: string, roleId: number, db: DbClient = this.client): Promise<void> {
    await db.userRole.deleteMany({ where: { userId, roleId } });
  }

  listManagedChildren(parentId: string): Promise<User[]> {
    return this.client.user.findMany({
      where: { managedByParentId: parentId },
      orderBy: { createdAt: 'asc' },
    });
  }

  listAllManagedChildren(): Promise<ManagedChildWithParent[]> {
    return this.client.user.findMany({
      where: { managedByParentId: { not: null } },
      include: { parent: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  updateChild(childId: string, data: { name: string; dateOfBirth: Date }): Promise<User> {
    return this.client.user.update({
      where: { id: childId },
      data: { name: data.name, dateOfBirth: data.dateOfBirth },
    });
  }

  async setClaimInviteSentAt(
    childId: string,
    data: { at: Date; pendingClaimEmail: string },
    db: DbClient = this.client,
  ): Promise<void> {
    await db.user.update({
      where: { id: childId },
      data: { claimInviteSentAt: data.at, pendingClaimEmail: data.pendingClaimEmail },
    });
  }

  claimAccount(
    childId: string,
    data: { email: string; passwordHash: string },
    db: DbClient = this.client,
  ): Promise<User> {
    return db.user.update({
      where: { id: childId },
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        verified: true,
        managedByParentId: null,
        pendingClaimEmail: null,
      },
    });
  }

  async setPendingEmail(userId: string, email: string, db: DbClient = this.client): Promise<void> {
    await db.user.update({ where: { id: userId }, data: { pendingEmail: email } });
  }

  confirmEmailChange(userId: string, newEmail: string, db: DbClient = this.client): Promise<User> {
    return db.user.update({
      where: { id: userId },
      data: { email: newEmail, verified: true, pendingEmail: null },
    });
  }
}
