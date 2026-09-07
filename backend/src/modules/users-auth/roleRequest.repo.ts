import { Prisma, type PrismaClient, type RoleName, type RoleRequestStatus } from '@prisma/client';
import type { DbClient } from '../../lib/db';
import { ConflictError } from '../../lib/errors';

export interface RoleRequestRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  requestedRole: RoleName;
  status: RoleRequestStatus;
  createdAt: Date;
  decidedAt: Date | null;
}

const include = { user: { select: { name: true, email: true } } } as const;

function toRow(row: {
  id: string;
  userId: string;
  user: { name: string; email: string };
  requestedRole: RoleName;
  status: RoleRequestStatus;
  createdAt: Date;
  decidedAt: Date | null;
}): RoleRequestRow {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user.name,
    userEmail: row.user.email,
    requestedRole: row.requestedRole,
    status: row.status,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
  };
}

export interface RoleRequestRepoPort {
  create(userId: string, requestedRole: RoleName, db?: DbClient): Promise<RoleRequestRow>;
  findById(id: string): Promise<RoleRequestRow | null>;
  findPendingForUser(userId: string): Promise<RoleRequestRow | null>;
  listPending(): Promise<RoleRequestRow[]>;
  listForUser(userId: string): Promise<RoleRequestRow[]>;
  claim(
    id: string,
    status: 'approved' | 'denied',
    decidedById: string,
    db?: DbClient,
  ): Promise<RoleRequestRow | null>;
}

export class PrismaRoleRequestRepo implements RoleRequestRepoPort {
  constructor(private readonly client: PrismaClient) {}

  async create(
    userId: string,
    requestedRole: RoleName,
    db: DbClient = this.client,
  ): Promise<RoleRequestRow> {
    try {
      const row = await db.roleRequest.create({
        data: { userId, requestedRole },
        include,
      });
      return toRow(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('You already have a pending role request.', 'ROLE_REQUEST_PENDING');
      }
      throw err;
    }
  }

  async findById(id: string): Promise<RoleRequestRow | null> {
    const row = await this.client.roleRequest.findUnique({ where: { id }, include });
    return row ? toRow(row) : null;
  }

  async findPendingForUser(userId: string): Promise<RoleRequestRow | null> {
    const row = await this.client.roleRequest.findFirst({
      where: { userId, status: 'pending' },
      include,
    });
    return row ? toRow(row) : null;
  }

  async listPending(): Promise<RoleRequestRow[]> {
    const rows = await this.client.roleRequest.findMany({
      where: { status: 'pending' },
      include,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRow);
  }

  async listForUser(userId: string): Promise<RoleRequestRow[]> {
    const rows = await this.client.roleRequest.findMany({
      where: { userId },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRow);
  }

  async claim(
    id: string,
    status: 'approved' | 'denied',
    decidedById: string,
    db: DbClient = this.client,
  ): Promise<RoleRequestRow | null> {
    const { count } = await db.roleRequest.updateMany({
      where: { id, status: 'pending' },
      data: { status, decidedById, decidedAt: new Date() },
    });
    if (count === 0) return null;
    return this.findById(id);
  }
}
