import type { CreateSurfaceTypeInput, SurfaceTypeDto } from '@nforce/shared';
import type { SurfaceType } from '@prisma/client';
import type { AuditPort } from '../audit/audit.service';
import type { AuthzService } from '../users-auth/authz.service';
import { ForbiddenError } from '../../lib/errors';
import type { SurfaceTypeRepoPort } from './surfaceType.repo';

function toDto(row: SurfaceType): SurfaceTypeDto {
  return { id: row.id, name: row.name, organizerId: row.organizerId };
}

export interface SurfaceTypeServiceDeps {
  surfaceTypes: SurfaceTypeRepoPort;
  authz: AuthzService;
  audit: AuditPort;
}

export class SurfaceTypeService {
  constructor(private readonly deps: SurfaceTypeServiceDeps) {}

  async list(viewerId: string): Promise<SurfaceTypeDto[]> {
    const rows = await this.deps.surfaceTypes.listVisibleTo(viewerId);
    return rows.map(toDto);
  }

  async create(
    actorId: string,
    input: CreateSurfaceTypeInput,
    ip?: string,
  ): Promise<SurfaceTypeDto> {
    await this.deps.authz.assertRole(actorId, 'organizer');
    const row = await this.deps.surfaceTypes.create({ name: input.name, organizerId: actorId });
    await this.deps.audit.write({
      action: 'surface_type.created',
      actorUserId: actorId,
      entityType: 'surface_type',
      entityId: row.id,
      meta: { name: row.name },
      ip,
    });
    return toDto(row);
  }

  async delete(actorId: string, id: string, ip?: string): Promise<void> {
    await this.deps.authz.assertRole(actorId, 'organizer');
    const existing = await this.deps.surfaceTypes.findById(id);
    if (!existing || existing.organizerId !== actorId) {
      throw new ForbiddenError('You can only delete surface types you created yourself.');
    }
    await this.deps.surfaceTypes.delete(id);
    await this.deps.audit.write({
      action: 'surface_type.deleted',
      actorUserId: actorId,
      entityType: 'surface_type',
      entityId: id,
      meta: { name: existing.name },
      ip,
    });
  }
}
