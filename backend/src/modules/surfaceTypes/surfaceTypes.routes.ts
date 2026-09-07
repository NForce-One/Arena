import { createSurfaceTypeSchema } from '@nforce/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { SurfaceTypeService } from './surfaceType.service';

const idParam = z.object({ id: z.string().min(1) });

export function buildSurfaceTypeRoutes(
  surfaceTypes: SurfaceTypeService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get('/', requireAuth, async (req, res) => {
    res.json({ surfaceTypes: await surfaceTypes.list(req.auth!.userId) });
  });

  router.post('/', requireAuth, async (req, res) => {
    const input = validate(createSurfaceTypeSchema, req.body);
    const row = await surfaceTypes.create(req.auth!.userId, input, req.ip);
    res.status(201).json({ surfaceType: row });
  });

  router.delete('/:id', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    await surfaceTypes.delete(req.auth!.userId, id, req.ip);
    res.status(204).end();
  });

  return router;
}
