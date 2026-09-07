import { sendExternalInviteSchema } from '@nforce/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { ExternalInviteService } from './externalInvite.service';

const idParam = z.object({ id: z.string().min(1) });
const tokenParam = z.object({ token: z.string().min(1) });

export function buildExternalInviteOrganizerRoutes(
  invites: ExternalInviteService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.post('/:id/external-invites', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const { email, role, tournamentAgeGroupId } = validate(sendExternalInviteSchema, req.body);
    const result = await invites.send(req.auth!.userId, id, role, email, tournamentAgeGroupId);
    res.status(201).json(result);
  });

  router.get('/:id/external-invites', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ invites: await invites.listForTournament(req.auth!.userId, id) });
  });

  return router;
}

export function buildExternalInviteRoutes(invites: ExternalInviteService): Router {
  const router = Router();

  router.get('/by-token/:token', async (req, res) => {
    const { token } = validate(tokenParam, req.params);
    res.json({ preview: await invites.getByToken(token) });
  });

  return router;
}
