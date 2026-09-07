import type { PrismaClient } from '@prisma/client';
import type { DbClient } from '../../lib/db';

export interface AuditEntry {
  action: string;
  actorUserId?: string | null;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  ip?: string;
}

export interface AuditPort {
  write(entry: AuditEntry, db?: DbClient): Promise<void>;
}

export class PrismaAuditService implements AuditPort {
  constructor(private readonly client: PrismaClient) {}

  async write(entry: AuditEntry, db: DbClient = this.client): Promise<void> {
    await db.auditLog.create({
      data: {
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        meta: (entry.meta ?? {}) as object,
        ip: entry.ip ?? null,
      },
    });
  }
}
