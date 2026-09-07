import { contactMessageSchema } from '@nforce/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { ContactService } from './contact.service';

const idParam = z.object({ id: z.string().min(1) });

export function buildContactRoutes(contact: ContactService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.post('/', requireAuth, async (req, res) => {
    const input = validate(contactMessageSchema, req.body);
    const message = await contact.submit(req.auth!.userId, input);
    res.status(201).json({ message });
  });

  return router;
}

export function buildAdminContactRoutes(
  contact: ContactService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get('/contact-messages', requireAuth, async (req, res) => {
    res.json({ messages: await contact.listAll(req.auth!.userId) });
  });

  router.post('/contact-messages/:id/resolve', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const message = await contact.resolve(req.auth!.userId, id, req.ip);
    res.json({ message });
  });

  return router;
}
