import {
  requestEmailChangeSchema,
  roleChangeSchema,
  sportsProfileSchema,
  updateNotifyPublishStatesSchema,
  updateProfileSchema,
  uploadPhotoSchema,
} from '@nforce/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { AuthService } from './auth.service';
import type { UsersService } from './users.service';

const userIdParam = z.object({ id: z.string().min(1) });
const roleParam = z.object({ id: z.string().min(1), role: roleChangeSchema.shape.role });

export function buildUserRoutes(
  users: UsersService,
  auth: AuthService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get('/me', requireAuth, async (req, res) => {
    res.json({ user: await users.me(req.auth!.userId) });
  });

  router.get('/me/profile', requireAuth, async (req, res) => {
    res.json({ profile: await users.getProfile(req.auth!.userId) });
  });

  router.patch('/me/profile', requireAuth, async (req, res) => {
    const input = validate(updateProfileSchema, req.body);
    res.json({ profile: await users.updateProfile(req.auth!.userId, input) });
  });

  router.put('/me/photo', requireAuth, async (req, res) => {
    const input = validate(uploadPhotoSchema, req.body);
    res.json({ profile: await users.uploadPhoto(req.auth!.userId, input) });
  });

  router.delete('/me/photo', requireAuth, async (req, res) => {
    res.json({ profile: await users.deletePhoto(req.auth!.userId) });
  });

  router.patch('/me/sports-profile', requireAuth, async (req, res) => {
    const input = validate(sportsProfileSchema, req.body);
    res.json({ profile: await users.updateSportsProfile(req.auth!.userId, input) });
  });

  router.patch('/me/notify-publish-states', requireAuth, async (req, res) => {
    const { states } = validate(updateNotifyPublishStatesSchema, req.body);
    res.json({ profile: await users.updateNotifyPublishStates(req.auth!.userId, states) });
  });

  router.post('/me/become-parent', requireAuth, async (req, res) => {
    const roles = await users.becomeParent(req.auth!.userId, req.ip);
    res.json({ roles });
  });

  router.post('/me/become-player', requireAuth, async (req, res) => {
    const roles = await users.becomePlayer(req.auth!.userId, req.ip);
    res.json({ roles });
  });

  router.post('/me/email/change', requireAuth, async (req, res) => {
    const input = validate(requestEmailChangeSchema, req.body);
    await auth.requestEmailChange(req.auth!.userId, input.newEmail, input.password);
    res.json({
      ok: true,
      message: 'Check the new address for a confirmation link. Nothing changes until you click it.',
    });
  });

  return router;
}

export function buildAdminUserRoutes(users: UsersService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.get('/users', requireAuth, async (req, res) => {
    res.json({ users: await users.listUsers(req.auth!.userId) });
  });

  router.post('/users/:id/roles', requireAuth, async (req, res) => {
    const { id } = validate(userIdParam, req.params);
    const { role } = validate(roleChangeSchema, req.body);
    const roles = await users.grantRole(req.auth!.userId, id, role, req.ip);
    res.json({ userId: id, roles });
  });

  router.delete('/users/:id/roles/:role', requireAuth, async (req, res) => {
    const { id, role } = validate(roleParam, req.params);
    const roles = await users.revokeRole(req.auth!.userId, id, role, req.ip);
    res.json({ userId: id, roles });
  });

  router.post('/users/:id/resend-verification', requireAuth, async (req, res) => {
    const { id } = validate(userIdParam, req.params);
    await users.requestVerification(req.auth!.userId, id, req.ip);
    res.json({ ok: true });
  });

  return router;
}
