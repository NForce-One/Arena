import type { AuditEntryDto } from '@nforce/shared';
import { Router, type RequestHandler } from 'express';
import type { AuthzService } from '../users-auth/authz.service';
import type { AuditReadPort } from './audit.repo';

export class AuditQueryService {
  constructor(
    private readonly repo: AuditReadPort,
    private readonly authz: AuthzService,
  ) {}

  async list(actorId: string): Promise<AuditEntryDto[]> {
    await this.authz.assertRole(actorId, 'platform_admin');
    const rows = await this.repo.listRecent();
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }
}

export function buildAdminAuditRoutes(
  service: AuditQueryService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get('/audit', requireAuth, async (req, res) => {
    res.json({ entries: await service.list(req.auth!.userId) });
  });

  return router;
}
