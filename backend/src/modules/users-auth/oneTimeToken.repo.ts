import type { OneTimeTokenType, PrismaClient } from '@prisma/client';
import type { DbClient } from '../../lib/db';

export type ConsumeResult =
  | { outcome: 'consumed'; userId: string }
  | { outcome: 'used' }
  | { outcome: 'expired' }
  | { outcome: 'invalid' };

export interface OneTimeTokenRepoPort {
  issue(data: {
    userId: string;
    type: OneTimeTokenType;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  consume(tokenHash: string, type: OneTimeTokenType, db?: DbClient): Promise<ConsumeResult>;
}

export class PrismaOneTimeTokenRepo implements OneTimeTokenRepoPort {
  constructor(private readonly client: PrismaClient) {}

  async issue(data: {
    userId: string;
    type: OneTimeTokenType;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.client.$transaction([
      this.client.oneTimeToken.updateMany({
        where: { userId: data.userId, type: data.type, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.client.oneTimeToken.create({ data }),
    ]);
  }

  async consume(
    tokenHash: string,
    type: OneTimeTokenType,
    db: DbClient = this.client,
  ): Promise<ConsumeResult> {
    const updated = await db.oneTimeToken.updateMany({
      where: { tokenHash, type, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (updated.count === 1) {
      const row = await db.oneTimeToken.findUnique({ where: { tokenHash } });
      if (!row) return { outcome: 'invalid' };
      return { outcome: 'consumed', userId: row.userId };
    }
    const row = await db.oneTimeToken.findUnique({ where: { tokenHash } });
    if (!row || row.type !== type) return { outcome: 'invalid' };
    if (row.consumedAt) return { outcome: 'used' };
    return { outcome: 'expired' };
  }
}
