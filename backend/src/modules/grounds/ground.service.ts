import type { CreateGroundInput, GroundDto, UpdateGroundInput } from '@nforce/shared';
import { ForbiddenError, NotFoundError } from '../../lib/errors';
import type { TxRunner } from '../../lib/db';
import type { AuditPort } from '../audit/audit.service';
import type { AuthzService } from '../users-auth/authz.service';
import type { UserRepoPort } from '../users-auth/user.repo';
import type { GroundRepoPort, GroundRow, GroundSearchResult } from './ground.repo';

function toDto(row: GroundRow): GroundDto {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    capacity: row.capacity,
    facilities: row.facilities,
    availabilityRules: row.availabilityRules,
    ownerId: row.ownerId,
  };
}

export interface GroundServiceDeps {
  grounds: GroundRepoPort;
  users: Pick<UserRepoPort, 'findById'>;
  authz: AuthzService;
  audit: AuditPort;
  tx: TxRunner;
}

export class GroundService {
  constructor(private readonly deps: GroundServiceDeps) {}

  private async assertOwnerOrAdmin(actorId: string, ground: GroundRow): Promise<void> {
    if (ground.ownerId === actorId) return;
    const roles = await this.deps.authz.getRoles(actorId);
    if (!roles.includes('platform_admin')) {
      throw new ForbiddenError('You are not allowed to manage this ground', 'NOT_ALLOWED');
    }
  }

  private async getOr404(id: string): Promise<GroundRow> {
    const row = await this.deps.grounds.findById(id);
    if (!row) throw new NotFoundError('Ground not found');
    return row;
  }

  async create(actorId: string, input: CreateGroundInput, ip?: string): Promise<GroundDto> {
    await this.deps.authz.assertRole(actorId, 'ground_owner');
    const actor = await this.deps.users.findById(actorId);
    if (!actor?.verified) {
      throw new ForbiddenError('Verify your email before listing a ground.', 'EMAIL_NOT_VERIFIED');
    }
    const row = await this.deps.grounds.create(actorId, {
      name: input.name,
      location: input.location,
      capacity: input.capacity ?? null,
      facilities: input.facilities,
      availabilityRules: input.availabilityRules,
    });
    await this.deps.audit.write({
      action: 'ground.created',
      actorUserId: actorId,
      entityType: 'ground',
      entityId: row.id,
      meta: { name: row.name },
      ip,
    });
    return toDto(row);
  }

  async listMine(actorId: string): Promise<GroundDto[]> {
    await this.deps.authz.assertRole(actorId, 'ground_owner');
    const rows = await this.deps.grounds.listByOwner(actorId);
    return rows.map(toDto);
  }

  async update(
    actorId: string,
    id: string,
    input: UpdateGroundInput,
    ip?: string,
  ): Promise<GroundDto> {
    const existing = await this.getOr404(id);
    await this.assertOwnerOrAdmin(actorId, existing);
    const row = await this.deps.grounds.update(id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity ?? null } : {}),
      ...(input.facilities !== undefined ? { facilities: input.facilities } : {}),
      ...(input.availabilityRules !== undefined
        ? { availabilityRules: input.availabilityRules }
        : {}),
    });

    const changedFields: string[] = [];
    if (input.name !== undefined && input.name !== existing.name) changedFields.push('name');
    if (input.location !== undefined && input.location !== existing.location) {
      changedFields.push('location');
    }
    if (input.capacity !== undefined && (input.capacity ?? null) !== existing.capacity) {
      changedFields.push('capacity');
    }
    if (input.facilities !== undefined) changedFields.push('facilities');
    if (input.availabilityRules !== undefined) changedFields.push('availability');

    if (changedFields.length > 0) {
      await this.deps.audit.write({
        action: 'ground.updated',
        actorUserId: actorId,
        entityType: 'ground',
        entityId: id,
        meta: {
          name: row.name,
          changedFields,
          ...(changedFields.includes('name') ? { previousName: existing.name } : {}),
        },
        ip,
      });
    }
    return toDto(row);
  }

  search(query: string): Promise<GroundSearchResult[]> {
    return this.deps.grounds.searchByName(query);
  }

  async delete(actorId: string, id: string, ip?: string): Promise<void> {
    const existing = await this.getOr404(id);
    await this.assertOwnerOrAdmin(actorId, existing);
    await this.deps.tx.run(async (db) => {
      await this.deps.grounds.delete(id, db);
      await this.deps.audit.write(
        {
          action: 'ground.deleted',
          actorUserId: actorId,
          entityType: 'ground',
          entityId: id,
          meta: { name: existing.name },
          ip,
        },
        db,
      );
    });
  }
}
