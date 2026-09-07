import {
  createTournamentSchema,
  updateTournamentSchema,
  uploadRulesDocumentSchema,
} from '@nforce/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { OrganizerTournamentService } from './organizerTournament.service';

const idParam = z.object({ id: z.string().min(1) });

export function buildOrganizerTournamentRoutes(
  tournaments: OrganizerTournamentService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.post('/', requireAuth, async (req, res) => {
    const input = validate(createTournamentSchema, req.body);
    const row = await tournaments.create(req.auth!.userId, input, req.ip);
    res.status(201).json({ tournament: row });
  });

  router.get('/mine', requireAuth, async (req, res) => {
    res.json({ tournaments: await tournaments.listMine(req.auth!.userId) });
  });

  router.get('/:id', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ tournament: await tournaments.getOwned(req.auth!.userId, id) });
  });

  router.patch('/:id', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const input = validate(updateTournamentSchema, req.body);
    const row = await tournaments.update(req.auth!.userId, id, input, req.ip);
    res.json({ tournament: row });
  });

  router.put('/:id/rules-document', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const input = validate(uploadRulesDocumentSchema, req.body);
    res.json({ tournament: await tournaments.uploadRulesDocument(req.auth!.userId, id, input) });
  });

  router.delete('/:id/rules-document', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ tournament: await tournaments.deleteRulesDocument(req.auth!.userId, id, req.ip) });
  });

  router.post('/:id/publish', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ tournament: await tournaments.publish(req.auth!.userId, id, req.ip) });
  });

  router.post('/:id/close', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ tournament: await tournaments.close(req.auth!.userId, id, req.ip) });
  });

  router.delete('/:id', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    await tournaments.delete(req.auth!.userId, id, req.ip);
    res.status(204).send();
  });

  return router;
}
