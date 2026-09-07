import type { PrismaClient, RefreshToken } from '@prisma/client';
import type { DbClient } from '../../lib/db';

export interface NewRefreshToken {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
}

export interface RefreshTokenRepoPort {
  create(data: NewRefreshToken): Promise<RefreshToken>;
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  rotate(oldId: string, next: NewRefreshToken): Promise<RefreshToken | null>;
  revokeFamily(familyId: string): Promise<void>;
  revokeAllForUser(userId: string, db?: DbClient): Promise<void>;
}

export class PrismaRefreshTokenRepo implements RefreshTokenRepoPort {
  constructor(private readonly client: PrismaClient) {}

  create(data: NewRefreshToken): Promise<RefreshToken> {
    return this.client.refreshToken.create({
      data: { ...data, userAgent: data.userAgent ?? null, ip: data.ip ?? null },
    });
  }

  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.client.refreshToken.findUnique({ where: { tokenHash } });
  }

  async rotate(oldId: string, next: NewRefreshToken): Promise<RefreshToken | null> {
    return this.client.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: oldId, rotatedAt: null, revokedAt: null },
        data: { rotatedAt: new Date() },
      });
      if (claimed.count === 0) return null;

      const successor = await tx.refreshToken.create({
        data: { ...next, userAgent: next.userAgent ?? null, ip: next.ip ?? null },
      });
      await tx.refreshToken.update({
        where: { id: oldId },
        data: { replacedById: successor.id },
      });
      return successor;
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.client.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string, db: DbClient = this.client): Promise<void> {
    await db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
