import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { BookingService, isWithinAvailability } from '../../src/modules/grounds/booking.service';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import {
  FakeAudit,
  FakeBookingRepo,
  FakeFixtureRepo,
  FakeGroundRepo,
  FakeNotificationRepo,
  FakeUserRepo,
  fakeTx,
  MailboxAdapter,
} from '../helpers/fakes';

describe('isWithinAvailability', () => {
  const rules = [{ days: 'all', from: '06:00', to: '22:00' }];
  it('accepts a slot inside the window', () => {
    expect(
      isWithinAvailability(
        rules,
        new Date('2026-08-03T09:00:00Z'),
        new Date('2026-08-03T13:00:00Z'),
      ),
    ).toBe(true);
  });
  it('rejects a slot starting before the window opens', () => {
    expect(
      isWithinAvailability(
        rules,
        new Date('2026-08-03T05:00:00Z'),
        new Date('2026-08-03T07:00:00Z'),
      ),
    ).toBe(false);
  });
  it('rejects a day not in the rule', () => {
    const monOnly = [{ days: 'mon', from: '06:00', to: '22:00' }];
    expect(
      isWithinAvailability(
        monOnly,
        new Date('2026-08-04T09:00:00Z'),
        new Date('2026-08-04T13:00:00Z'),
      ),
    ).toBe(false);
  });
});

describe('BookingService', () => {
  let users: FakeUserRepo;
  let grounds: FakeGroundRepo;
  let bookingRepo: FakeBookingRepo;
  let fixtureRepo: FakeFixtureRepo;
  let service: BookingService;
  let organizerId: string;
  let ownerId: string;
  let groundId: string;

  const slot = (h1: number, h2: number) => ({
    startsAt: new Date(`2026-08-03T${String(h1).padStart(2, '0')}:00:00Z`),
    endsAt: new Date(`2026-08-03T${String(h2).padStart(2, '0')}:00:00Z`),
  });

  beforeEach(async () => {
    users = new FakeUserRepo();
    grounds = new FakeGroundRepo();
    bookingRepo = new FakeBookingRepo(grounds, users);
    fixtureRepo = new FakeFixtureRepo();
    const notifications = new NotificationService({
      notifications: new FakeNotificationRepo(),
      users,
      email: new MailboxAdapter(),
    });
    service = new BookingService({
      bookings: bookingRepo,
      grounds,
      fixtures: fixtureRepo,
      notifications,
      authz: new AuthzService(users),
      audit: new FakeAudit(),
      tx: fakeTx,
    });

    const mk = async (email: string, roleIds: number[]) => {
      const u = await users.create({ name: email, email, passwordHash: await hash('x'), roleIds });
      await users.setVerified(u.id);
      return u.id;
    };
    organizerId = await mk('organizer@example.com', [2]);
    ownerId = await mk('owner@example.com', [5]);
    const ground = await grounds.create(ownerId, {
      name: 'Sunrise Ground',
      location: 'Hyderabad',
      capacity: 5000,
      facilities: [],
      availabilityRules: [{ days: 'all', from: '06:00', to: '22:00' }],
    });
    groundId = ground.id;
  });

  it('an organizer can request a booking inside availability', async () => {
    const s = slot(9, 13);
    const booking = await service.request(organizerId, groundId, s.startsAt, s.endsAt);
    expect(booking.status).toBe('requested');
  });

  it('an organizer can list their own booking requests, with live status', async () => {
    const s = slot(9, 13);
    const booking = await service.request(organizerId, groundId, s.startsAt, s.endsAt);
    let mine = await service.listForRequester(organizerId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: booking.id, status: 'requested' });

    await service.confirm(ownerId, booking.id);
    mine = await service.listForRequester(organizerId);
    expect(mine[0]!.status).toBe('confirmed');
  });

  it('a non-organizer cannot list booking requests', async () => {
    await expect(service.listForRequester(ownerId)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
  });

  it('refuses a booking outside the availability window', async () => {
    const s = {
      startsAt: new Date('2026-08-03T04:00:00Z'),
      endsAt: new Date('2026-08-03T05:00:00Z'),
    };
    await expect(
      service.request(organizerId, groundId, s.startsAt, s.endsAt),
    ).rejects.toMatchObject({
      code: 'OUTSIDE_AVAILABILITY',
    });
  });

  it('the owner confirms; a second overlapping confirm is refused by the constraint', async () => {
    const a = slot(9, 13);
    const b = slot(12, 16);
    const bookingA = await service.request(organizerId, groundId, a.startsAt, a.endsAt);
    const bookingB = await service.request(organizerId, groundId, b.startsAt, b.endsAt);

    const confirmedA = await service.confirm(ownerId, bookingA.id);
    expect(confirmedA.status).toBe('confirmed');

    await expect(service.confirm(ownerId, bookingB.id)).rejects.toMatchObject({
      code: 'BOOKING_CONFLICT',
    });
  });

  it('a non-owner cannot confirm', async () => {
    const s = slot(9, 13);
    const booking = await service.request(organizerId, groundId, s.startsAt, s.endsAt);
    await expect(service.confirm(organizerId, booking.id)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
  });

  it('declining leaves the slot free for another booking to confirm', async () => {
    const a = slot(9, 13);
    const b = slot(9, 13);
    const bookingA = await service.request(organizerId, groundId, a.startsAt, a.endsAt);
    const bookingB = await service.request(organizerId, groundId, b.startsAt, b.endsAt);
    await service.decline(ownerId, bookingA.id);
    const confirmedB = await service.confirm(ownerId, bookingB.id);
    expect(confirmedB.status).toBe('confirmed');
  });

  it('the requesting organizer can cancel their own booking', async () => {
    const s = slot(9, 13);
    const booking = await service.request(organizerId, groundId, s.startsAt, s.endsAt);
    const cancelled = await service.cancel(organizerId, booking.id);
    expect(cancelled.status).toBe('cancelled');
  });

  it('cancelling a confirmed booking frees the slot', async () => {
    const a = slot(9, 13);
    const b = slot(9, 13);
    const bookingA = await service.request(organizerId, groundId, a.startsAt, a.endsAt);
    await service.confirm(ownerId, bookingA.id);
    await service.cancel(ownerId, bookingA.id);
    const bookingB = await service.request(organizerId, groundId, b.startsAt, b.endsAt);
    const confirmedB = await service.confirm(ownerId, bookingB.id);
    expect(confirmedB.status).toBe('confirmed');
  });

  describe('declining/cancelling a booking tied to a fixture', () => {
    let fixtureId: string;

    beforeEach(async () => {
      const fixture = await fixtureRepo.create({
        tournamentId: 't-1',
        homeTeamId: 'team-a',
        awayTeamId: 'team-b',
        groundId,
        startsAt: slot(9, 13).startsAt,
        durationMinutes: 240,
      });
      fixtureId = fixture.id;
    });

    it('declining leaves the match without a ground', async () => {
      const s = slot(9, 13);
      const booking = await service.request(organizerId, groundId, s.startsAt, s.endsAt, fixtureId);
      await service.decline(ownerId, booking.id);
      const fixture = await fixtureRepo.findById(fixtureId);
      expect(fixture!.groundId).toBeNull();
    });

    it('cancelling leaves the match without a ground', async () => {
      const s = slot(9, 13);
      const booking = await service.request(organizerId, groundId, s.startsAt, s.endsAt, fixtureId);
      await service.confirm(ownerId, booking.id);
      await service.cancel(ownerId, booking.id);
      const fixture = await fixtureRepo.findById(fixtureId);
      expect(fixture!.groundId).toBeNull();
    });

    it('a booking with no fixture attached declines/cancels without touching any fixture', async () => {
      const s = slot(9, 13);
      const booking = await service.request(organizerId, groundId, s.startsAt, s.endsAt);
      await expect(service.decline(ownerId, booking.id)).resolves.toMatchObject({
        status: 'declined',
      });
      const fixture = await fixtureRepo.findById(fixtureId);
      expect(fixture!.groundId).toBe(groundId);
    });
  });
});
