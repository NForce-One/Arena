import { rescheduleFixtureSchema, scheduleFixtureSchema } from '@nforce/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { FixtureService } from './fixture.service';
import type { UmpireService } from './umpire.service';

const idParam = z.object({ id: z.string().min(1) });
const assignBody = z.object({ umpireId: z.string().min(1) });

export function buildTournamentFixtureRoutes(
  fixtures: FixtureService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.post('/:id/fixtures', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const input = validate(scheduleFixtureSchema, req.body);
    const row = await fixtures.schedule(req.auth!.userId, id, input, req.ip);
    res.status(201).json({ fixture: row });
  });

  router.get('/:id/fixtures', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ fixtures: await fixtures.listForTournament(req.auth!.userId, id) });
  });

  return router;
}

export function buildFixtureRoutes(
  fixtures: FixtureService,
  umpires: UmpireService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.patch('/:id', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const input = validate(rescheduleFixtureSchema, req.body);
    res.json({ fixture: await fixtures.reschedule(req.auth!.userId, id, input, req.ip) });
  });

  router.post('/:id/assign', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const { umpireId } = validate(assignBody, req.body);
    await umpires.assign(req.auth!.userId, id, umpireId, req.ip);
    res.json({ ok: true });
  });

  router.post('/:id/invite-umpire', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const { umpireId } = validate(assignBody, req.body);
    await umpires.invite(req.auth!.userId, id, umpireId, req.ip);
    res.json({ ok: true });
  });

  router.get('/umpire-directory', requireAuth, async (req, res) => {
    res.json({ umpires: await umpires.listDirectory(req.auth!.userId) });
  });

  return router;
}

export function buildUmpireRoutes(umpires: UmpireService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.get('/open-fixtures', requireAuth, async (req, res) => {
    res.json({ fixtures: await umpires.listOpen(req.auth!.userId) });
  });

  router.get('/schedule', requireAuth, async (req, res) => {
    res.json({ schedule: await umpires.schedule(req.auth!.userId) });
  });

  router.post('/fixtures/:id/apply', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    await umpires.apply(req.auth!.userId, id);
    res.json({ ok: true });
  });

  router.post('/fixtures/:id/respond', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const { decision } = validate(z.object({ decision: z.enum(['accept', 'decline']) }), req.body);
    await umpires.respondToInvite(req.auth!.userId, id, decision);
    res.json({ ok: true });
  });

  return router;
}
