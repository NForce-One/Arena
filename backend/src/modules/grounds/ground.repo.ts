import { Prisma, type PrismaClient } from '@prisma/client';
import type { DbClient } from '../../lib/db';
import { ConflictError, NotFoundError } from '../../lib/errors';

function groundInUseError(): ConflictError {
  return new ConflictError(
    'This ground still has bookings or scheduled fixtures. Cancel or reassign them first.',
    'GROUND_IN_USE',
  );
}

export interface AvailabilityRule {
  days: string;
  from: string;
  to: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface GroundRow {
  id: string;
  name: string;
  location: string;
  capacity: number | null;
  facilities: string[];
  availabilityRules: AvailabilityRule[];
  ownerId: string;
}

export interface GroundWrite {
  name: string;
  location: string;
  capacity: number | null;
  facilities: string[];
  availabilityRules: AvailabilityRule[];
}

export const GROUND_SEARCH_LIMIT = 100;

export interface GroundSearchResult {
  id: string;
  name: string;
  location: string;
  capacity: number | null;
  facilities: string[];
  availabilityRules: AvailabilityRule[];
}

function toRow(row: {
  id: string;
  name: string;
  location: string;
  capacity: number | null;
  facilities: Prisma.JsonValue;
  availabilityRules: Prisma.JsonValue;
  ownerId: string;
}): GroundRow {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    capacity: row.capacity,
    facilities: row.facilities as string[],
    availabilityRules: row.availabilityRules as unknown as AvailabilityRule[],
    ownerId: row.ownerId,
  };
}

export interface GroundRepoPort {
  create(ownerId: string, data: GroundWrite): Promise<GroundRow>;
  findById(id: string): Promise<GroundRow | null>;
  listByOwner(ownerId: string): Promise<GroundRow[]>;
  update(id: string, data: Partial<GroundWrite>): Promise<GroundRow>;
  searchByName(query: string): Promise<GroundSearchResult[]>;
  delete(id: string, db?: DbClient): Promise<void>;
}

export class PrismaGroundRepo implements GroundRepoPort {
  constructor(private readonly client: PrismaClient) {}

  async create(ownerId: string, data: GroundWrite): Promise<GroundRow> {
    const row = await this.client.ground.create({
      data: {
        name: data.name,
        location: data.location,
        capacity: data.capacity,
        facilities: data.facilities as unknown as Prisma.InputJsonValue,
        availabilityRules: data.availabilityRules as unknown as Prisma.InputJsonValue,
        ownerId,
      },
    });
    return toRow(row);
  }

  async findById(id: string): Promise<GroundRow | null> {
    const row = await this.client.ground.findUnique({ where: { id } });
    return row ? toRow(row) : null;
  }

  async listByOwner(ownerId: string): Promise<GroundRow[]> {
    const rows = await this.client.ground.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRow);
  }

  async update(id: string, data: Partial<GroundWrite>): Promise<GroundRow> {
    try {
      const row = await this.client.ground.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.location !== undefined ? { location: data.location } : {}),
          ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
          ...(data.facilities !== undefined
            ? { facilities: data.facilities as unknown as Prisma.InputJsonValue }
            : {}),
          ...(data.availabilityRules !== undefined
            ? { availabilityRules: data.availabilityRules as unknown as Prisma.InputJsonValue }
            : {}),
        },
      });
      return toRow(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('Ground not found');
      }
      throw err;
    }
  }

  async delete(id: string, db: DbClient = this.client): Promise<void> {
    try {
      await db.ground.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') throw new NotFoundError('Ground not found');
        if (err.code === 'P2003') throw groundInUseError();
      }
      if (
        err instanceof Prisma.PrismaClientUnknownRequestError &&
        /foreign key constraint/i.test(err.message)
      ) {
        throw groundInUseError();
      }
      throw err;
    }
  }

  async searchByName(query: string): Promise<GroundSearchResult[]> {
    const rows = await this.client.ground.findMany({
      where: { name: { contains: query, mode: 'insensitive' } },
      take: GROUND_SEARCH_LIMIT,
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      location: r.location,
      capacity: r.capacity,
      facilities: r.facilities as unknown as string[],
      availabilityRules: r.availabilityRules as unknown as AvailabilityRule[],
    }));
  }
}
