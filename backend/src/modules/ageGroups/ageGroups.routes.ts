import { createOrganizerAgeGroupSchema } from '@nforce/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { AgeGroupService } from './ageGroup.service';

const idParam = z.object({ id: z.string().min(1) });
const hiddenBody = z.object({ hidden: z.boolean() });

export function buildAgeGroupRoutes(
  ageGroups: AgeGroupService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get('/', requireAuth, async (req, res) => {
    res.json({ ageGroups: await ageGroups.list(req.auth!.userId) });
  });

  router.post('/', requireAuth, async (req, res) => {
    const input = validate(createOrganizerAgeGroupSchema, req.body);
    const row = await ageGroups.create(req.auth!.userId, input, req.ip);
    res.status(201).json({ ageGroup: row });
  });

  router.patch('/:id/hidden', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const { hidden } = validate(hiddenBody, req.body);
    const row = await ageGroups.setHidden(req.auth!.userId, id, hidden, req.ip);
    res.json({ ageGroup: row });
  });

  return router;
}
