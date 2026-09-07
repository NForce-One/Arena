import { ROLE_LABELS, type RequestableRole, type RoleRequestDto } from '@nforce/shared';
import { ConflictError, NotFoundError } from '../../lib/errors';
import type { TxRunner } from '../../lib/db';
import type { AuditPort } from '../audit/audit.service';
import type { NotificationService } from '../notifications/notification.service';
import type { AuthzService } from './authz.service';
import type { RoleRequestRepoPort, RoleRequestRow } from './roleRequest.repo';
import type { UsersService } from './users.service';

export interface RoleRequestServiceDeps {
  roleRequests: RoleRequestRepoPort;
  users: UsersService;
  authz: AuthzService;
  notifications: NotificationService;
  audit: AuditPort;
  tx: TxRunner;
}

function toDto(row: RoleRequestRow): RoleRequestDto {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    requestedRole: row.requestedRole,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  };
}

export class RoleRequestService {
  constructor(private readonly deps: RoleRequestServiceDeps) {}

  async listPending(actorId: string): Promise<RoleRequestDto[]> {
    await this.deps.authz.assertRole(actorId, 'platform_admin');
    const rows = await this.deps.roleRequests.listPending();
    return rows.map(toDto);
  }

  async listMine(userId: string): Promise<RoleRequestDto[]> {
    const rows = await this.deps.roleRequests.listForUser(userId);
    return rows.map(toDto);
  }

  async requestRole(userId: string, role: RequestableRole): Promise<RoleRequestDto> {
    const me = await this.deps.users.me(userId);
    if (me.roles.includes(role)) {
      throw new ConflictError(
        `You already hold the ${ROLE_LABELS[role]} role.`,
        'ALREADY_HAS_ROLE',
      );
    }

    const created = await this.deps.roleRequests.create(userId, role);

    const adminIds = await this.deps.users.listAdminIds();
    for (const adminId of adminIds) {
      await this.deps.notifications.notify({
        userId: adminId,
        type: 'role_request_submitted',
        title: `New role request: ${ROLE_LABELS[role]}`,
        body: `${me.name} asked to become a ${ROLE_LABELS[role]}.`,
        payload: { userId, role },
      });
    }

    return toDto(created);
  }

  async approve(actorId: string, requestId: string, ip?: string): Promise<void> {
    await this.deps.authz.assertRole(actorId, 'platform_admin');
    const existing = await this.deps.roleRequests.findById(requestId);
    if (!existing) throw new NotFoundError('Role request not found');

    const claimed = await this.deps.roleRequests.claim(requestId, 'approved', actorId);
    if (!claimed) {
      throw new ConflictError('This request has already been decided.', 'ALREADY_DECIDED');
    }

    await this.deps.users.grantRoleReplacingPlayer(
      actorId,
      claimed.userId,
      claimed.requestedRole,
      ip,
    );

    await this.deps.notifications.notify({
      userId: claimed.userId,
      type: 'role_request_approved',
      title: `Your ${ROLE_LABELS[claimed.requestedRole]} request was approved`,
      body: `You are now a ${ROLE_LABELS[claimed.requestedRole]} instead of a Player.`,
      payload: { requestId: claimed.id, role: claimed.requestedRole },
    });
  }

  async deny(actorId: string, requestId: string, ip?: string): Promise<void> {
    await this.deps.authz.assertRole(actorId, 'platform_admin');
    const existing = await this.deps.roleRequests.findById(requestId);
    if (!existing) throw new NotFoundError('Role request not found');

    const claimed = await this.deps.tx.run(async (db) => {
      const c = await this.deps.roleRequests.claim(requestId, 'denied', actorId, db);
      if (!c) {
        throw new ConflictError('This request has already been decided.', 'ALREADY_DECIDED');
      }
      await this.deps.audit.write(
        {
          action: 'role_request.denied',
          actorUserId: actorId,
          entityType: 'role_request',
          entityId: c.id,
          meta: { role: c.requestedRole, targetUserId: c.userId },
          ip,
        },
        db,
      );
      return c;
    });

    await this.deps.notifications.notify({
      userId: claimed.userId,
      type: 'role_request_denied',
      title: `Your ${ROLE_LABELS[claimed.requestedRole]} request was denied`,
      body: `Your request to become a ${ROLE_LABELS[claimed.requestedRole]} was not approved.`,
      payload: { requestId: claimed.id, role: claimed.requestedRole },
    });
  }
}
