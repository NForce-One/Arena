import type { ContactMessageStatus, PrismaClient } from '@prisma/client';
import type { DbClient } from '../../lib/db';

export interface ContactMessageRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
  status: ContactMessageStatus;
  createdAt: Date;
  resolvedAt: Date | null;
}

const include = { user: { select: { name: true, email: true } } } as const;

function toRow(row: {
  id: string;
  userId: string;
  user: { name: string; email: string };
  subject: string;
  message: string;
  status: ContactMessageStatus;
  createdAt: Date;
  resolvedAt: Date | null;
}): ContactMessageRow {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user.name,
    userEmail: row.user.email,
    subject: row.subject,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
}

export interface ContactMessageRepoPort {
  create(
    userId: string,
    input: { subject: string; message: string },
    db?: DbClient,
  ): Promise<ContactMessageRow>;
  findById(id: string): Promise<ContactMessageRow | null>;
  listAll(): Promise<ContactMessageRow[]>;
  resolve(id: string, resolvedById: string, db?: DbClient): Promise<ContactMessageRow>;
}

export class PrismaContactMessageRepo implements ContactMessageRepoPort {
  constructor(private readonly client: PrismaClient) {}

  async create(
    userId: string,
    input: { subject: string; message: string },
    db: DbClient = this.client,
  ): Promise<ContactMessageRow> {
    const row = await db.contactMessage.create({
      data: { userId, subject: input.subject, message: input.message },
      include,
    });
    return toRow(row);
  }

  async findById(id: string): Promise<ContactMessageRow | null> {
    const row = await this.client.contactMessage.findUnique({ where: { id }, include });
    return row ? toRow(row) : null;
  }

  async listAll(): Promise<ContactMessageRow[]> {
    const rows = await this.client.contactMessage.findMany({
      include,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRow);
  }

  async resolve(
    id: string,
    resolvedById: string,
    db: DbClient = this.client,
  ): Promise<ContactMessageRow> {
    const row = await db.contactMessage.update({
      where: { id },
      data: { status: 'resolved', resolvedById, resolvedAt: new Date() },
      include,
    });
    return toRow(row);
  }
}
