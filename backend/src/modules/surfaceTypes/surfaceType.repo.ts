import { Prisma, type SurfaceType, type PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError } from '../../lib/errors';

export interface SurfaceTypeWrite {
  name: string;
  organizerId: string;
}

export interface SurfaceTypeRepoPort {
  listVisibleTo(organizerId: string): Promise<SurfaceType[]>;
  findById(id: string): Promise<SurfaceType | null>;
  create(data: SurfaceTypeWrite): Promise<SurfaceType>;
  delete(id: string): Promise<void>;
}

export class PrismaSurfaceTypeRepo implements SurfaceTypeRepoPort {
  constructor(private readonly client: PrismaClient) {}

  listVisibleTo(organizerId: string): Promise<SurfaceType[]> {
    return this.client.surfaceType.findMany({
      where: { OR: [{ organizerId: null }, { organizerId }] },
      orderBy: { name: 'asc' },
    });
  }

  findById(id: string): Promise<SurfaceType | null> {
    return this.client.surfaceType.findUnique({ where: { id } });
  }

  async create(data: SurfaceTypeWrite): Promise<SurfaceType> {
    try {
      return await this.client.surfaceType.create({ data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError(
          'A surface type with this name already exists.',
          'SURFACE_TYPE_EXISTS',
        );
      }
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.client.surfaceType.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2025') throw new NotFoundError('Surface type not found');
        if (err.code === 'P2003') {
          throw new ConflictError(
            "This surface type is used by an existing tournament and can't be deleted.",
            'SURFACE_TYPE_IN_USE',
          );
        }
      }
      throw err;
    }
  }
}
