import { registerSchema, updatePaymentSchema } from '@nforce/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { RegistrationService } from './registration.service';

const idParam = z.object({ id: z.string().min(1) });
const paymentParams = z.object({ id: z.string().min(1), userId: z.string().min(1) });
const playerProfileParams = z.object({ id: z.string().min(1), userId: z.string().min(1) });

export function buildTournamentRegistrationRoutes(
  registrations: RegistrationService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.post('/:id/register', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const input = validate(registerSchema, req.body ?? {});
    const row = await registrations.register(req.auth!.userId, id, input);
    res.status(201).json({ registration: row });
  });

  router.get('/:id/registrations', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ registrations: await registrations.listFor(req.auth!.userId, id) });
  });

  router.get('/:id/registrations/detail', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ registrations: await registrations.listDetailFor(req.auth!.userId, id) });
  });

  router.get('/:id/my-registrations', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ registrations: await registrations.findMine(req.auth!.userId, id) });
  });

  router.get('/:id/recruitable-players', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ players: await registrations.listRecruitablePlayers(req.auth!.userId, id) });
  });

  router.get('/:id/recruiting-teams', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ teams: await registrations.listRecruitingTeams(req.auth!.userId, id) });
  });

  router.get('/:id/players/:userId/contact-profile', requireAuth, async (req, res) => {
    const { id, userId } = validate(playerProfileParams, req.params);
    res.json({
      profile: await registrations.getPlayerContactProfile(req.auth!.userId, id, userId),
    });
  });

  return router;
}

export function buildRegistrationWithdrawRoutes(
  registrations: RegistrationService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.post('/:id/withdraw', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    await registrations.withdraw(req.auth!.userId, id, req.ip);
    res.json({ ok: true });
  });

  router.patch('/:id/payment/:userId', requireAuth, async (req, res) => {
    const { id, userId } = validate(paymentParams, req.params);
    const { status, amountPaid } = validate(updatePaymentSchema, req.body);
    await registrations.updatePayment(
      req.auth!.userId,
      id,
      userId,
      status,
      amountPaid ?? null,
      req.ip,
    );
    res.json({ ok: true });
  });

  router.patch('/:id/team-payment', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const { status, amountPaid } = validate(updatePaymentSchema, req.body);
    await registrations.updateTeamPayment(req.auth!.userId, id, status, amountPaid ?? null, req.ip);
    res.json({ ok: true });
  });

  return router;
}
