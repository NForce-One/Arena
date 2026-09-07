import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { UserRepoPort } from '../users-auth/user.repo';
import type { PlayerProfileService } from './playerProfile.service';

const idParam = z.object({ id: z.string().min(1) });

export function buildPublicPlayerRoutes(service: PlayerProfileService): Router {
  const router = Router();

  router.get('/players/:id', async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ player: await service.getProfile(id) });
  });

  return router;
}

export function buildPlayerSearchRoutes(
  users: Pick<UserRepoPort, 'searchPlayersByName'>,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get('/players/search', requireAuth, async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ players: await users.searchPlayersByName(query) });
  });

  return router;
}
