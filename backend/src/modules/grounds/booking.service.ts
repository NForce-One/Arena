import type { GroundBookingDto } from '@nforce/shared';
import { isWithinAvailability } from '@nforce/shared';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import type { TxRunner } from '../../lib/db';
import type { AuditPort } from '../audit/audit.service';
import type { FixtureRepoPort } from '../fixtures/fixture.repo';
import type { NotificationService } from '../notifications/notification.service';
import type { AuthzService } from '../users-auth/authz.service';
import type { GroundRepoPort } from './ground.repo';
import type { BookingRepoPort, BookingRow } from './booking.repo';

function toDto(row: BookingRow): GroundBookingDto {
  return {
    id: row.id,
    groundId: row.groundId,
    groundName: row.groundName,
    requesterId: row.requesterId,
    requesterName: row.requesterName,
    fixtureId: row.fixtureId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status,
  };
}

export { isWithinAvailability };

export interface BookingServiceDeps {
  bookings: BookingRepoPort;
  grounds: Pick<GroundRepoPort, 'findById'>;
  fixtures: Pick<FixtureRepoPort, 'clearGround'>;
  notifications: NotificationService;
  authz: AuthzService;
  audit: AuditPort;
  tx: TxRunner;
}

export class BookingService {
  constructor(private readonly deps: BookingServiceDeps) {}

  private async isOwnerOrAdmin(actorId: string, groundId: string): Promise<boolean> {
    const ground = await this.deps.grounds.findById(groundId);
    if (ground && ground.ownerId === actorId) return true;
    const roles = await this.deps.authz.getRoles(actorId);
    return roles.includes('platform_admin');
  }

  private async getOr404(id: string): Promise<BookingRow> {
    const row = await this.deps.bookings.findById(id);
    if (!row) throw new NotFoundError('Booking not found');
    return row;
  }

  async request(
    actorId: string,
    groundId: string,
    startsAt: Date,
    endsAt: Date,
    fixtureId?: string,
  ): Promise<GroundBookingDto> {
    await this.deps.authz.assertRole(actorId, 'organizer');
    const ground = await this.deps.grounds.findById(groundId);
    if (!ground) throw new NotFoundError('Ground not found');
    if (!isWithinAvailability(ground.availabilityRules, startsAt, endsAt)) {
      throw new ConflictError(
        "That time is outside the ground's available days/hours.",
        'OUTSIDE_AVAILABILITY',
      );
    }
    const row = await this.deps.bookings.create({
      groundId,
      requesterId: actorId,
      fixtureId: fixtureId ?? null,
      startsAt,
      endsAt,
    });
    await this.deps.notifications.notify({
      userId: ground.ownerId,
      type: 'booking_requested',
      title: 'New booking request',
      body: `A booking was requested for ${ground.name}.`,
      payload: { bookingId: row.id, groundId },
    });
    return toDto(row);
  }

  async listForOwner(actorId: string): Promise<GroundBookingDto[]> {
    await this.deps.authz.assertRole(actorId, 'ground_owner');
    const rows = await this.deps.bookings.listForOwner(actorId);
    return rows.map(toDto);
  }

  async listForRequester(actorId: string): Promise<GroundBookingDto[]> {
    await this.deps.authz.assertRole(actorId, 'organizer');
    const rows = await this.deps.bookings.listForRequester(actorId);
    return rows.map(toDto);
  }

  async confirm(actorId: string, bookingId: string, ip?: string): Promise<GroundBookingDto> {
    const booking = await this.getOr404(bookingId);
    if (!(await this.isOwnerOrAdmin(actorId, booking.groundId))) {
      throw new ForbiddenError('You are not allowed to confirm this booking', 'NOT_ALLOWED');
    }
    if (booking.status !== 'requested') {
      throw new ConflictError('Only a requested booking can be confirmed.', 'INVALID_STATUS');
    }
    const row = await this.deps.bookings.setStatus(bookingId, 'confirmed');
    await this.deps.audit.write({
      action: 'booking.confirmed',
      actorUserId: actorId,
      entityType: 'ground_booking',
      entityId: bookingId,
      ip,
    });
    await this.deps.notifications.notify({
      userId: booking.requesterId,
      type: 'booking_confirmed',
      title: 'Booking confirmed',
      body: `Your booking for ${booking.groundName} was confirmed.`,
      payload: { bookingId },
    });
    return toDto(row);
  }

  async decline(actorId: string, bookingId: string, ip?: string): Promise<GroundBookingDto> {
    const booking = await this.getOr404(bookingId);
    if (!(await this.isOwnerOrAdmin(actorId, booking.groundId))) {
      throw new ForbiddenError('You are not allowed to decline this booking', 'NOT_ALLOWED');
    }
    if (booking.status !== 'requested') {
      throw new ConflictError('Only a requested booking can be declined.', 'INVALID_STATUS');
    }
    const row = await this.deps.tx.run(async (db) => {
      const updated = await this.deps.bookings.setStatus(bookingId, 'declined', db);
      if (booking.fixtureId) await this.deps.fixtures.clearGround(booking.fixtureId, db);
      await this.deps.audit.write(
        {
          action: 'booking.declined',
          actorUserId: actorId,
          entityType: 'ground_booking',
          entityId: bookingId,
          ip,
        },
        db,
      );
      return updated;
    });
    await this.deps.notifications.notify({
      userId: booking.requesterId,
      type: 'booking_declined',
      title: 'Booking declined',
      body: `Your booking request for ${booking.groundName} was declined.`,
      payload: { bookingId },
    });
    return toDto(row);
  }

  async cancel(actorId: string, bookingId: string, ip?: string): Promise<GroundBookingDto> {
    const booking = await this.getOr404(bookingId);
    const isOwnerOrAdmin = await this.isOwnerOrAdmin(actorId, booking.groundId);
    if (booking.requesterId !== actorId && !isOwnerOrAdmin) {
      throw new ForbiddenError('You are not allowed to cancel this booking', 'NOT_ALLOWED');
    }
    if (booking.status !== 'requested' && booking.status !== 'confirmed') {
      throw new ConflictError(
        'Only a requested or confirmed booking can be cancelled.',
        'INVALID_STATUS',
      );
    }
    const row = await this.deps.tx.run(async (db) => {
      const updated = await this.deps.bookings.setStatus(bookingId, 'cancelled', db);
      if (booking.fixtureId) await this.deps.fixtures.clearGround(booking.fixtureId, db);
      await this.deps.audit.write(
        {
          action: 'booking.cancelled',
          actorUserId: actorId,
          entityType: 'ground_booking',
          entityId: bookingId,
          ip,
        },
        db,
      );
      return updated;
    });
    const ground = await this.deps.grounds.findById(booking.groundId);
    const notifyingOwner = booking.requesterId === actorId;
    const notifyUserId = notifyingOwner ? ground?.ownerId : booking.requesterId;
    if (notifyUserId) {
      await this.deps.notifications.notify({
        userId: notifyUserId,
        type: 'booking_cancelled',
        title: 'Booking cancelled',
        body: `A booking for ${booking.groundName} was cancelled.`,
        payload: { bookingId, forRole: notifyingOwner ? 'ground_owner' : 'organizer' },
      });
    }
    return toDto(row);
  }
}
