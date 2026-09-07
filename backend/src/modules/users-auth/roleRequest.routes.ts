import { requestRoleSchema } from '@nforce/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { RoleRequestService } from './roleRequest.service';

const requestIdParam = z.object({ id: z.string().min(1) });

export function buildRoleRequestRoutes(
  roleRequests: RoleRequestService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get('/me/role-requests', requireAuth, async (req, res) => {
    res.json({ requests: await roleRequests.listMine(req.auth!.userId) });
  });

  router.post('/me/role-requests', requireAuth, async (req, res) => {
    const { role } = validate(requestRoleSchema, req.body);
    const request = await roleRequests.requestRole(req.auth!.userId, role);
    res.status(201).json({ request });
  });

  return router;
}

export function buildAdminRoleRequestRoutes(
  roleRequests: RoleRequestService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get('/role-requests', requireAuth, async (req, res) => {
    res.json({ requests: await roleRequests.listPending(req.auth!.userId) });
  });

  router.post('/role-requests/:id/approve', requireAuth, async (req, res) => {
    const { id } = validate(requestIdParam, req.params);
    await roleRequests.approve(req.auth!.userId, id, req.ip);
    res.json({ ok: true });
  });

  router.post('/role-requests/:id/deny', requireAuth, async (req, res) => {
    const { id } = validate(requestIdParam, req.params);
    await roleRequests.deny(req.auth!.userId, id, req.ip);
    res.json({ ok: true });
  });

  return router;
}
