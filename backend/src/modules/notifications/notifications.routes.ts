import { createAnnouncementSchema } from '@nforce/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { AnnouncementService } from './announcement.service';
import type { NotificationService } from './notification.service';

const idParam = z.object({ id: z.string().min(1) });

export function buildNotificationRoutes(
  notifications: NotificationService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get('/', requireAuth, async (req, res) => {
    res.json(await notifications.listFor(req.auth!.userId));
  });

  router.post('/read-all', requireAuth, async (req, res) => {
    await notifications.markAllRead(req.auth!.userId);
    res.json({ ok: true });
  });

  router.post('/:id/read', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    await notifications.markRead(req.auth!.userId, id);
    res.json({ ok: true });
  });

  router.post('/:id/unread', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    await notifications.markUnread(req.auth!.userId, id);
    res.json({ ok: true });
  });

  return router;
}

export function buildAnnouncementRoutes(
  announcements: AnnouncementService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.post('/announcements', requireAuth, async (req, res) => {
    const input = validate(createAnnouncementSchema, req.body);
    const result = await announcements.publish(req.auth!.userId, input, req.ip);
    res.status(201).json(result);
  });

  return router;
}
