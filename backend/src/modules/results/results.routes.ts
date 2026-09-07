import { enterResultSchema } from '@nforce/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { ResultService } from './result.service';

const idParam = z.object({ id: z.string().min(1) });

export function buildResultRoutes(results: ResultService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.put('/:id/result', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const input = validate(enterResultSchema, req.body);
    res.json({ result: await results.enter(req.auth!.userId, id, input, req.ip) });
  });

  router.get('/:id/result', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ result: await results.getForFixture(id) });
  });

  router.get('/:id/rosters', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ rosters: await results.rostersForFixture(req.auth!.userId, id) });
  });

  return router;
}
