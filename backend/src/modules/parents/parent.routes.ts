import {
  addChildSchema,
  inviteChildToClaimSchema,
  registerChildSchema,
  rosterInviteResponseSchema,
  sportsProfileSchema,
  updateChildSchema,
  uploadPhotoSchema,
} from '@nforce/shared';
import { invitationResponseSchema } from '@nforce/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { AuthService } from '../users-auth/auth.service';
import type { RegistrationService } from '../registrations/registration.service';
import type { TournamentInvitationService } from '../registrations/tournamentInvitation.service';
import type { TeamService } from '../teams/team.service';
import type { ParentService } from './parent.service';

const childIdParam = z.object({ childId: z.string().min(1) });
const childTournamentParams = z.object({
  childId: z.string().min(1),
  tournamentId: z.string().min(1),
});
const childTeamParams = z.object({ childId: z.string().min(1), teamId: z.string().min(1) });
const childInvitationParams = z.object({
  childId: z.string().min(1),
  invitationId: z.string().min(1),
});

export function buildParentRoutes(
  parents: ParentService,
  registrations: RegistrationService,
  teams: TeamService,
  invitations: TournamentInvitationService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.post('/children', requireAuth, async (req, res) => {
    const input = validate(addChildSchema, req.body);
    const child = await parents.addChild(req.auth!.userId, input, req.ip);
    res.status(201).json({ child });
  });

  router.get('/children', requireAuth, async (req, res) => {
    res.json({ children: await parents.listChildren(req.auth!.userId) });
  });

  router.patch('/children/:childId', requireAuth, async (req, res) => {
    const { childId } = validate(childIdParam, req.params);
    const input = validate(updateChildSchema, req.body);
    const child = await parents.updateChild(req.auth!.userId, childId, input, req.ip);
    res.json({ child });
  });

  router.put('/children/:childId/photo', requireAuth, async (req, res) => {
    const { childId } = validate(childIdParam, req.params);
    const input = validate(uploadPhotoSchema, req.body);
    const child = await parents.uploadChildPhoto(req.auth!.userId, childId, input);
    res.json({ child });
  });

  router.delete('/children/:childId/photo', requireAuth, async (req, res) => {
    const { childId } = validate(childIdParam, req.params);
    const child = await parents.deleteChildPhoto(req.auth!.userId, childId, req.ip);
    res.json({ child });
  });

  router.get('/children/:childId/fixtures', requireAuth, async (req, res) => {
    const { childId } = validate(childIdParam, req.params);
    res.json({ fixtures: await parents.childFixtures(req.auth!.userId, childId) });
  });

  router.get('/children/:childId/sports-profile', requireAuth, async (req, res) => {
    const { childId } = validate(childIdParam, req.params);
    const profile = await parents.getChildSportsProfile(req.auth!.userId, childId);
    res.json({ profile });
  });

  router.patch('/children/:childId/sports-profile', requireAuth, async (req, res) => {
    const { childId } = validate(childIdParam, req.params);
    const input = validate(sportsProfileSchema, req.body);
    const profile = await parents.updateChildSportsProfile(
      req.auth!.userId,
      childId,
      input,
      req.ip,
    );
    res.json({ profile });
  });

  router.post(
    '/children/:childId/tournaments/:tournamentId/register',
    requireAuth,
    async (req, res) => {
      const { childId, tournamentId } = validate(childTournamentParams, req.params);
      const input = validate(registerChildSchema, req.body);
      const registration = await registrations.registerChild(
        req.auth!.userId,
        childId,
        tournamentId,
        input.tournamentAgeGroupId,
        req.ip,
      );
      res.status(201).json({ registration });
    },
  );

  router.get('/registrations', requireAuth, async (req, res) => {
    res.json({ registrations: await registrations.findFamily(req.auth!.userId) });
  });

  router.post('/children/:childId/teams/:teamId/roster/respond', requireAuth, async (req, res) => {
    const { childId, teamId } = validate(childTeamParams, req.params);
    const { decision } = validate(rosterInviteResponseSchema, req.body);
    await teams.respondToInviteForChild(req.auth!.userId, childId, teamId, decision, req.ip);
    res.json({ ok: true });
  });

  router.get('/children/:childId/tournament-invitations', requireAuth, async (req, res) => {
    const { childId } = validate(childIdParam, req.params);
    await parents.assertOwnedMinor(req.auth!.userId, childId);
    res.json({ invitations: await invitations.listMine(childId) });
  });

  router.get('/children/:childId/roster-invitations', requireAuth, async (req, res) => {
    const { childId } = validate(childIdParam, req.params);
    res.json({ invitations: await teams.myInvitationsForChild(req.auth!.userId, childId) });
  });

  router.post(
    '/children/:childId/tournament-invitations/:invitationId/respond',
    requireAuth,
    async (req, res) => {
      const { childId, invitationId } = validate(childInvitationParams, req.params);
      const { decision } = validate(invitationResponseSchema, req.body);
      await invitations.respondForChild(req.auth!.userId, childId, invitationId, decision);
      res.json({ ok: true });
    },
  );

  return router;
}

export function buildAdminChildRoutes(
  parents: ParentService,
  auth: AuthService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.get('/children/approaching-adulthood', requireAuth, async (req, res) => {
    res.json({ children: await parents.listChildrenApproachingAdulthood(req.auth!.userId) });
  });

  router.post('/children/:childId/claim-invite', requireAuth, async (req, res) => {
    const { childId } = validate(childIdParam, req.params);
    const input = validate(inviteChildToClaimSchema, req.body);
    await auth.inviteChildToClaim(req.auth!.userId, childId, input, req.ip);
    res.json({ ok: true, message: 'Invite sent.' });
  });

  return router;
}
