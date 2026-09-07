import {
  assignDraftPlayerSchema,
  createDraftTeamSchema,
  createTeamSchema,
  inviteRosterMemberSchema,
  requestToJoinSchema,
  rosterInviteResponseSchema,
  rosterRequestResponseSchema,
  updateTeamSchema,
} from '@nforce/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { TeamService } from './team.service';

const idParam = z.object({ id: z.string().min(1) });
const memberParams = z.object({ id: z.string().min(1), userId: z.string().min(1) });
const ageGroupQuery = z.object({ tournamentAgeGroupId: z.string().min(1) });

export function buildTeamRoutes(teams: TeamService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.post('/', requireAuth, async (req, res) => {
    const input = validate(createTeamSchema, req.body);
    res.status(201).json({ team: await teams.create(req.auth!.userId, input) });
  });

  router.get('/mine', requireAuth, async (req, res) => {
    res.json({ teams: await teams.listMine(req.auth!.userId) });
  });

  router.get('/invitations', requireAuth, async (req, res) => {
    res.json({ invitations: await teams.myInvitations(req.auth!.userId) });
  });

  router.get('/pending-manager-invites', requireAuth, async (req, res) => {
    res.json({ invites: await teams.myPendingManagerInvites(req.auth!.userId) });
  });

  router.get('/search', requireAuth, async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ teams: await teams.search(query) });
  });

  router.get('/:id', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ team: await teams.getOwned(req.auth!.userId, id) });
  });

  router.patch('/:id', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const input = validate(updateTeamSchema, req.body);
    res.json({ team: await teams.update(req.auth!.userId, id, input, req.ip) });
  });

  router.post('/:id/roster', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const input = validate(inviteRosterMemberSchema, req.body);
    res.status(201).json({ team: await teams.inviteMember(req.auth!.userId, id, input) });
  });

  router.post('/:id/roster/respond', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const { decision } = validate(rosterInviteResponseSchema, req.body);
    await teams.respondToInvite(req.auth!.userId, id, decision);
    res.json({ ok: true });
  });

  router.post('/:id/roster/request', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const input = validate(requestToJoinSchema, req.body);
    await teams.requestToJoin(req.auth!.userId, id, input);
    res.status(201).json({ ok: true });
  });

  router.post('/:id/roster/:userId/respond', requireAuth, async (req, res) => {
    const { id, userId } = validate(memberParams, req.params);
    const { decision } = validate(rosterRequestResponseSchema, req.body);
    await teams.respondToJoinRequest(req.auth!.userId, id, userId, decision, req.ip);
    res.json({ ok: true });
  });

  router.delete('/:id/roster/:userId', requireAuth, async (req, res) => {
    const { id, userId } = validate(memberParams, req.params);
    await teams.removeMember(req.auth!.userId, id, userId, req.ip);
    res.status(204).send();
  });

  router.post('/:id/draft-roster', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const { userId } = validate(assignDraftPlayerSchema, req.body);
    res.json({ team: await teams.assignDraftPlayer(req.auth!.userId, id, userId) });
  });

  return router;
}

export function buildDraftTeamRoutes(teams: TeamService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.get('/:id/draft-teams', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const { tournamentAgeGroupId } = validate(ageGroupQuery, req.query);
    res.json({
      teams: await teams.listDraftTeams(req.auth!.userId, id, tournamentAgeGroupId),
    });
  });

  router.post('/:id/draft-teams', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const input = validate(createDraftTeamSchema, req.body);
    res.status(201).json({
      team: await teams.createDraftTeam(
        req.auth!.userId,
        id,
        input.tournamentAgeGroupId,
        input.name,
      ),
    });
  });

  return router;
}
