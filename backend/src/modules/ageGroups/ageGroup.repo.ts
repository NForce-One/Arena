import { Prisma, type AgeGroup, type PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../lib/errors';

export interface AgeGroupWrite {
  name: string;
  organizerId: string;
}

export interface AgeGroupRepoPort {
  listVisibleTo(organizerId: string): Promise<AgeGroup[]>;
  findById(id: string): Promise<AgeGroup | null>;
  create(data: AgeGroupWrite): Promise<AgeGroup>;
  setHidden(id: string, hidden: boolean): Promise<AgeGroup>;
}

export class PrismaAgeGroupRepo implements AgeGroupRepoPort {
  constructor(private readonly client: PrismaClient) {}

  listVisibleTo(organizerId: string): Promise<AgeGroup[]> {
    return this.client.ageGroup.findMany({
      where: {
        hidden: false,
        OR: [{ organizerId: null }, { organizerId }],
      },
      orderBy: { name: 'asc' },
    });
  }

  findById(id: string): Promise<AgeGroup | null> {
    return this.client.ageGroup.findUnique({ where: { id } });
  }

  async create(data: AgeGroupWrite): Promise<AgeGroup> {
    try {
      return await this.client.ageGroup.create({ data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('An age group with this name already exists.', 'AGE_GROUP_EXISTS');
      }
      throw err;
    }
  }

  async setHidden(id: string, hidden: boolean): Promise<AgeGroup> {
    try {
      return await this.client.ageGroup.update({ where: { id }, data: { hidden } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundError('Age group not found');
      }
      throw err;
    }
  }
}
