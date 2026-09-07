import { createGroundSchema, requestBookingSchema, updateGroundSchema } from '@nforce/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validate';
import type { BookingService } from './booking.service';
import type { GroundService } from './ground.service';

const idParam = z.object({ id: z.string().min(1) });

export function buildGroundRoutes(
  grounds: GroundService,
  bookings: BookingService,
  requireAuth: RequestHandler,
): Router {
  const router = Router();

  router.post('/', requireAuth, async (req, res) => {
    const input = validate(createGroundSchema, req.body);
    res.status(201).json({ ground: await grounds.create(req.auth!.userId, input, req.ip) });
  });

  router.get('/mine', requireAuth, async (req, res) => {
    res.json({ grounds: await grounds.listMine(req.auth!.userId) });
  });

  router.get('/bookings', requireAuth, async (req, res) => {
    res.json({ bookings: await bookings.listForOwner(req.auth!.userId) });
  });

  router.get('/search', requireAuth, async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ grounds: await grounds.search(query) });
  });

  router.patch('/:id', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    const input = validate(updateGroundSchema, req.body);
    res.json({ ground: await grounds.update(req.auth!.userId, id, input, req.ip) });
  });

  router.delete('/:id', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    await grounds.delete(req.auth!.userId, id, req.ip);
    res.status(204).end();
  });

  return router;
}

export function buildBookingRoutes(bookings: BookingService, requireAuth: RequestHandler): Router {
  const router = Router();

  router.post('/', requireAuth, async (req, res) => {
    const input = validate(requestBookingSchema, req.body);
    const row = await bookings.request(
      req.auth!.userId,
      input.groundId,
      new Date(input.startsAt),
      new Date(input.endsAt),
      input.fixtureId ?? undefined,
    );
    res.status(201).json({ booking: row });
  });

  router.get('/mine', requireAuth, async (req, res) => {
    res.json({ bookings: await bookings.listForRequester(req.auth!.userId) });
  });

  router.post('/:id/confirm', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ booking: await bookings.confirm(req.auth!.userId, id, req.ip) });
  });

  router.post('/:id/decline', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ booking: await bookings.decline(req.auth!.userId, id, req.ip) });
  });

  router.post('/:id/cancel', requireAuth, async (req, res) => {
    const { id } = validate(idParam, req.params);
    res.json({ booking: await bookings.cancel(req.auth!.userId, id, req.ip) });
  });

  return router;
}
