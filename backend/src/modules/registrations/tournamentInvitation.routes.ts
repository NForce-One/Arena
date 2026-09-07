import { invitationResponseSchema, inviteTeamSchema, invitePlayerSchema } from '@nforce/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { TournamentInvitationService } from './tournamentInvitation.service';

const idParam = z.object({ id: z.string().min(1) });

export function buildTournamentInvitationRoutes(
  invitations: TournamentInvitationService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.post('/:id/invite-team', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const {
      teamId,
      tournamentAgeGroupId,
      overrideRegistrationWindow,
      overrideEligibility,
      overrideCapacity,
    } = validate(inviteTeamSchema, req.body);
    const row = await invitations.invite(
      req.auth!.userId,
      id,
      teamId,
      tournamentAgeGroupId,
      overrideRegistrationWindow ?? false,
      overrideEligibility ?? false,
      overrideCapacity ?? false,
    );
    res.status(201).json({ invitation: row });
  });

  router.post('/:id/invite-player', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const {
      userId,
      tournamentAgeGroupId,
      overrideEligibility,
      overrideRegistrationWindow,
      overrideCapacity,
    } = validate(invitePlayerSchema, req.body);
    const row = await invitations.invitePlayer(
      req.auth!.userId,
      id,
      userId,
      tournamentAgeGroupId,
      overrideEligibility ?? false,
      overrideRegistrationWindow ?? false,
      overrideCapacity ?? false,
    );
    res.status(201).json({ invitation: row });
  });

  router.get('/:id/invitations', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ invitations: await invitations.listForTournament(req.auth!.userId, id) });
  });

  router.get('/:id/my-invitation', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ invitation: await invitations.findMyInvitation(req.auth!.userId, id) });
  });

  return router;
}

export function buildTeamInvitationRoutes(
  invitations: TournamentInvitationService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get('/:id/tournament-invitations', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ invitations: await invitations.listForTeam(req.auth!.userId, id) });
  });

  return router;
}

export function buildTeamInvitationResponseRoutes(
  invitations: TournamentInvitationService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.post('/:id/respond', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const { decision } = validate(invitationResponseSchema, req.body);
    await invitations.respond(req.auth!.userId, id, decision);
    res.json({ ok: true });
  });

  return router;
}

export function buildPlayerInvitationResponseRoutes(
  invitations: TournamentInvitationService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get('/mine', requireAuth, async (req, res) => {
    res.json({ invitations: await invitations.listMine(req.auth!.userId) });
  });

  router.post('/:id/respond', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const { decision } = validate(invitationResponseSchema, req.body);
    await invitations.respond(req.auth!.userId, id, decision);
    res.json({ ok: true });
  });

  return router;
}
