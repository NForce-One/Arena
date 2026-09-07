import type { RequestHandler } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { PublicTournamentService } from './public.service';

const idParam = z.object({ id: z.string().min(1) });

export function buildPublicTournamentRoutes(
  service: PublicTournamentService,
  optionalAuth: RequestHandler,
): Router {
  const router = Router();

  router.get('/tournaments', async (_req, res) => {
    res.json({ tournaments: await service.list() });
  });

  router.get('/tournaments/:id', optionalAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ tournament: await service.detail(id, req.auth?.userId) });
  });

  return router;
}
