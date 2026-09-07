import { Prisma, type BookingStatus, type PrismaClient } from '@prisma/client';
import type { DbClient } from '../../lib/db';
import { ConflictError, NotFoundError } from '../../lib/errors';

export interface BookingRow {
  id: string;
  groundId: string;
  groundName: string;
  requesterId: string;
  requesterName: string;
  fixtureId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
}

export interface BookingWrite {
  groundId: string;
  requesterId: string;
  fixtureId?: string | null;
  startsAt: Date;
  endsAt: Date;
}

const include = {
  ground: { select: { name: true } },
  requester: { select: { name: true } },
} as const;

function toRow(row: {
  id: string;
  groundId: string;
  ground: { name: string };
  requesterId: string;
  requester: { name: string };
  fixtureId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
}): BookingRow {
  return {
    id: row.id,
    groundId: row.groundId,
    groundName: row.ground.name,
    requesterId: row.requesterId,
    requesterName: row.requester.name,
    fixtureId: row.fixtureId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
  };
}

export interface BookingRepoPort {
  create(data: BookingWrite, db?: DbClient): Promise<BookingRow>;
  findById(id: string): Promise<BookingRow | null>;
  listForGround(groundId: string): Promise<BookingRow[]>;
  listForOwner(ownerId: string): Promise<BookingRow[]>;
  listForRequester(requesterId: string): Promise<BookingRow[]>;
  setStatus(id: string, status: BookingStatus, db?: DbClient): Promise<BookingRow>;
}

export class PrismaBookingRepo implements BookingRepoPort {
  constructor(private readonly client: PrismaClient) {}

  async create(data: BookingWrite, db: DbClient = this.client): Promise<BookingRow> {
    const row = await db.groundBooking.create({
      data: {
        groundId: data.groundId,
        requesterId: data.requesterId,
        fixtureId: data.fixtureId ?? null,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        status: 'requested',
      },
      include,
    });
    return toRow(row);
  }

  async findById(id: string): Promise<BookingRow | null> {
    const row = await this.client.groundBooking.findUnique({ where: { id }, include });
    return row ? toRow(row) : null;
  }

  async listForGround(groundId: string): Promise<BookingRow[]> {
    const rows = await this.client.groundBooking.findMany({
      where: { groundId },
      include,
      orderBy: { startsAt: 'asc' },
    });
    return rows.map(toRow);
  }

  async listForOwner(ownerId: string): Promise<BookingRow[]> {
    const rows = await this.client.groundBooking.findMany({
      where: { ground: { ownerId } },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRow);
  }

  async listForRequester(requesterId: string): Promise<BookingRow[]> {
    const rows = await this.client.groundBooking.findMany({
      where: { requesterId },
      include,
      orderBy: { startsAt: 'asc' },
    });
    return rows.map(toRow);
  }

  async setStatus(
    id: string,
    status: BookingStatus,
    db: DbClient = this.client,
  ): Promise<BookingRow> {
    try {
      const row = await db.groundBooking.update({ where: { id }, data: { status }, include });
      return toRow(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        const dbCode = (err.meta as { code?: string } | undefined)?.code;
        if (err.code === 'P2002' || dbCode === '23P01') {
          throw new ConflictError(
            'This time slot overlaps an already-confirmed booking on this ground.',
            'BOOKING_CONFLICT',
          );
        }
        if (err.code === 'P2025') throw new NotFoundError('Booking not found');
      }
      if (err instanceof Error && err.message.includes('ground_bookings_no_overlap')) {
        throw new ConflictError(
          'This time slot overlaps an already-confirmed booking on this ground.',
          'BOOKING_CONFLICT',
        );
      }
      throw err;
    }
  }
}
