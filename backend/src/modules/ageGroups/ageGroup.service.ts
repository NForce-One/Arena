import type { AgeGroupDto, CreateOrganizerAgeGroupInput } from '@nforce/shared';
import type { AgeGroup } from '@prisma/client';
import type { AuditPort } from '../audit/audit.service';
import type { AuthzService } from '../users-auth/authz.service';
import { ForbiddenError } from '../../lib/errors';
import type { AgeGroupRepoPort } from './ageGroup.repo';

function toDto(row: AgeGroup): AgeGroupDto {
  return {
    id: row.id,
    name: row.name,
    minAge: row.minAge,
    maxAge: row.maxAge,
    organizerId: row.organizerId,
  };
}

export interface AgeGroupServiceDeps {
  ageGroups: AgeGroupRepoPort;
  authz: AuthzService;
  audit: AuditPort;
}

export class AgeGroupService {
  constructor(private readonly deps: AgeGroupServiceDeps) {}

  async list(viewerId: string): Promise<AgeGroupDto[]> {
    const rows = await this.deps.ageGroups.listVisibleTo(viewerId);
    return rows.map(toDto);
  }

  async create(
    actorId: string,
    input: CreateOrganizerAgeGroupInput,
    ip?: string,
  ): Promise<AgeGroupDto> {
    await this.deps.authz.assertRole(actorId, 'organizer');
    const row = await this.deps.ageGroups.create({ name: input.name, organizerId: actorId });
    await this.deps.audit.write({
      action: 'age_group.created',
      actorUserId: actorId,
      entityType: 'age_group',
      entityId: row.id,
      meta: { name: row.name },
      ip,
    });
    return toDto(row);
  }

  async setHidden(actorId: string, id: string, hidden: boolean, ip?: string): Promise<AgeGroupDto> {
    await this.deps.authz.assertRole(actorId, 'organizer');
    const existing = await this.deps.ageGroups.findById(id);
    if (!existing || existing.organizerId !== actorId) {
      throw new ForbiddenError('You can only hide age groups you created yourself.');
    }
    const row = await this.deps.ageGroups.setHidden(id, hidden);
    await this.deps.audit.write({
      action: hidden ? 'age_group.hidden' : 'age_group.unhidden',
      actorUserId: actorId,
      entityType: 'age_group',
      entityId: row.id,
      meta: { name: row.name },
      ip,
    });
    return toDto(row);
  }
}
