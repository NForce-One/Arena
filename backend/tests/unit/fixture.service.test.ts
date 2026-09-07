import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { FixtureService } from '../../src/modules/fixtures/fixture.service';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import {
  FakeAudit,
  FakeBookingRepo,
  FakeFixtureRepo,
  FakeGroundRepo,
  FakeNotificationRepo,
  FakeOrganizerTournamentRepo,
  FakeTeamRepo,
  FakeUmpireAssignmentRepo,
  FakeUserRepo,
  MailboxAdapter,
  fakeTx,
} from '../helpers/fakes';

describe('FixtureService', () => {
  let users: FakeUserRepo;
  let fixtureRepo: FakeFixtureRepo;
  let assignmentRepo: FakeUmpireAssignmentRepo;
  let tournamentRepo: FakeOrganizerTournamentRepo;
  let bookingRepo: FakeBookingRepo;
  let groundRepo: FakeGroundRepo;
  let teamRepo: FakeTeamRepo;
  let notificationRepo: FakeNotificationRepo;
  let audit: FakeAudit;
  let service: FixtureService;
  let organizerId: string;
  let ownerId: string;
  let umpireId: string;
  let tournamentId: string;
  let groundId: string;

  beforeEach(async () => {
    users = new FakeUserRepo();
    fixtureRepo = new FakeFixtureRepo();
    assignmentRepo = new FakeUmpireAssignmentRepo(fixtureRepo, users);
    fixtureRepo.assignments = assignmentRepo;
    tournamentRepo = new FakeOrganizerTournamentRepo();
    groundRepo = new FakeGroundRepo();
    bookingRepo = new FakeBookingRepo(groundRepo, users);
    teamRepo = new FakeTeamRepo(users);
    notificationRepo = new FakeNotificationRepo();
    const notifications = new NotificationService({
      notifications: notificationRepo,
      users,
      email: new MailboxAdapter(),
    });
    audit = new FakeAudit();
    service = new FixtureService({
      fixtures: fixtureRepo,
      bookings: bookingRepo,
      grounds: groundRepo,
      umpires: assignmentRepo,
      users,
      tournaments: tournamentRepo,
      teams: teamRepo,
      notifications,
      authz: new AuthzService(users),
      audit,
      tx: fakeTx,
    });

    const mk = async (email: string, roleIds: number[]) => {
      const u = await users.create({ name: email, email, passwordHash: await hash('x'), roleIds });
      await users.setVerified(u.id);
      return u.id;
    };
    organizerId = await mk('organizer@example.com', [2]);
    ownerId = await mk('owner@example.com', [5]);
    umpireId = await mk('umpire@example.com', [6]);

    const t = await tournamentRepo.create(organizerId, {
      name: 'Cup',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-30'),
      capacity: 8,
    });
    tournamentId = t.id;
    await tournamentRepo.updateStatus(tournamentId, 'published');

    fixtureRepo.tournaments.set(tournamentId, { name: 'Cup', status: 'published' });
    fixtureRepo.teamNames.set('team-a', 'Falcons');
    fixtureRepo.teamNames.set('team-b', 'Tigers');
    fixtureRepo.registered.set(tournamentId, [
      { id: 'team-a', name: 'Falcons' },
      { id: 'team-b', name: 'Tigers' },
    ]);

    const ground = await groundRepo.create(ownerId, {
      name: 'Sunrise',
      location: 'Hyderabad',
      capacity: 100,
      facilities: [],
      availabilityRules: [{ days: 'all', from: '00:00', to: '23:59' }],
    });
    groundId = ground.id;
    fixtureRepo.groundNames.set(groundId, 'Sunrise');
  });

  const input = (over: Partial<Parameters<FixtureService['schedule']>[2]> = {}) => ({
    homeTeamId: 'team-a',
    awayTeamId: 'team-b',
    groundId,
    startsAt: '2026-08-05T09:00:00Z',
    durationMinutes: 240,
    umpireEmails: [] as string[],
    ...over,
  });

  it('only an organizer can schedule a match', async () => {
    await expect(service.schedule(umpireId, tournamentId, input())).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
  });

  it('schedules a match, creating a booking request and umpire invitation', async () => {
    const fixture = await service.schedule(
      organizerId,
      tournamentId,
      input({ umpireEmails: ['umpire@example.com'] }),
    );
    expect(fixture.homeTeam).toBe('Falcons');
    expect(fixture.awayTeam).toBe('Tigers');
    expect(fixture.umpires).toHaveLength(1);
    expect(fixture.umpires[0]).toMatchObject({ umpireId, status: 'invited' });
    const bookings = await bookingRepo.listForGround(groundId);
    expect(bookings).toHaveLength(1);
    expect(bookings[0]!.status).toBe('requested');
  });

  it('refuses a fixture with a team not registered', async () => {
    await expect(
      service.schedule(organizerId, tournamentId, input({ awayTeamId: 'team-x' })),
    ).rejects.toMatchObject({ code: 'TEAM_NOT_REGISTERED' });
  });

  it("accepts the organizer's own draft teams as fixture sides in a draft_based tournament", async () => {
    const draft = await tournamentRepo.create(organizerId, {
      name: 'Draft Cup',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-30'),
      capacity: 30,
      teamSelectionMode: 'draft_based',
    });
    await tournamentRepo.updateStatus(draft.id, 'published');
    fixtureRepo.tournaments.set(draft.id, { name: 'Draft Cup', status: 'published' });
    const teamA = await teamRepo.createDraft(organizerId, 'Draft A', 'age-group-1');
    const teamB = await teamRepo.createDraft(organizerId, 'Draft B', 'age-group-1');
    fixtureRepo.teamNames.set(teamA.id, teamA.name);
    fixtureRepo.teamNames.set(teamB.id, teamB.name);

    const fixture = await service.schedule(
      organizerId,
      draft.id,
      input({ homeTeamId: teamA.id, awayTeamId: teamB.id }),
    );
    expect(fixture.homeTeam).toBe('Draft A');
    expect(fixture.awayTeam).toBe('Draft B');
    expect(
      [...notificationRepo.rows.values()].filter((n) => n.userId === organizerId),
    ).toHaveLength(0);
  });

  it("notifies both teams' managers when a match involving them is scheduled", async () => {
    const managerA = (
      await users.create({
        name: 'mgr-a',
        email: 'mgr-a@example.com',
        passwordHash: 'x',
        roleIds: [4],
      })
    ).id;
    const managerB = (
      await users.create({
        name: 'mgr-b',
        email: 'mgr-b@example.com',
        passwordHash: 'x',
        roleIds: [4],
      })
    ).id;
    const teamA = await teamRepo.create(managerA, 'Falcons');
    const teamB = await teamRepo.create(managerB, 'Tigers');
    fixtureRepo.teamNames.set(teamA.id, teamA.name);
    fixtureRepo.teamNames.set(teamB.id, teamB.name);
    fixtureRepo.registered.set(tournamentId, [
      { id: teamA.id, name: teamA.name },
      { id: teamB.id, name: teamB.name },
    ]);

    await service.schedule(
      organizerId,
      tournamentId,
      input({ homeTeamId: teamA.id, awayTeamId: teamB.id }),
    );
    expect([...notificationRepo.rows.values()].filter((n) => n.userId === managerA)).toHaveLength(
      1,
    );
    expect([...notificationRepo.rows.values()].filter((n) => n.userId === managerB)).toHaveLength(
      1,
    );
  });

  it("refuses an organizer-managed but UNREGISTERED team in a prebuilt_rosters tournament — draft_based's carve-out doesn't leak", async () => {
    const stray = await teamRepo.create(organizerId, 'Stray Team');
    await expect(
      service.schedule(organizerId, tournamentId, input({ awayTeamId: stray.id })),
    ).rejects.toMatchObject({ code: 'TEAM_NOT_REGISTERED' });
  });

  it('refuses scheduling in a non-published tournament', async () => {
    const draft = await tournamentRepo.create(organizerId, {
      name: 'Draft',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-30'),
      capacity: 8,
    });
    fixtureRepo.registered.set(draft.id, [
      { id: 'team-a', name: 'Falcons' },
      { id: 'team-b', name: 'Tigers' },
    ]);
    await expect(service.schedule(organizerId, draft.id, input())).rejects.toMatchObject({
      code: 'TOURNAMENT_NOT_PUBLISHED',
    });
  });

  it('still allows scheduling once registration is closed — closing only stops new registrations, not fixture-building for whoever already registered', async () => {
    await tournamentRepo.updateStatus(tournamentId, 'closed');
    const fixture = await service.schedule(organizerId, tournamentId, input());
    expect(fixture.homeTeam).toBe('Falcons');
    expect(fixture.awayTeam).toBe('Tigers');
  });

  it('reschedules a fixture, opens a fresh booking (old one cancelled), and tells the ground owner', async () => {
    const fixture = await service.schedule(organizerId, tournamentId, input());
    notificationRepo.rows.clear();
    await service.reschedule(organizerId, fixture.id, {
      startsAt: '2026-08-06T09:00:00Z',
      durationMinutes: 240,
    });
    const bookings = await bookingRepo.listForGround(groundId);
    const active = bookings.filter((b) => b.status === 'requested');
    const cancelled = bookings.filter((b) => b.status === 'cancelled');
    expect(active).toHaveLength(1);
    expect(cancelled).toHaveLength(1);

    const ownerNotifs = [...notificationRepo.rows.values()].filter((n) => n.userId === ownerId);
    expect(ownerNotifs).toHaveLength(2);
    expect(ownerNotifs.find((n) => n.type === 'booking_cancelled')?.body).toContain('Sunrise');
    expect(ownerNotifs.find((n) => n.type === 'booking_requested')?.body).toContain('Sunrise');
    expect(ownerNotifs.find((n) => n.type === 'booking_cancelled')?.payload).toMatchObject({
      forRole: 'ground_owner',
    });

    const entries = audit.actionsOf('fixture.rescheduled');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      meta: {
        previousStartsAt: '2026-08-05T09:00:00.000Z',
        startsAt: '2026-08-06T09:00:00.000Z',
        previousDurationMinutes: 240,
        durationMinutes: 240,
        groundChanged: false,
      },
    });
  });

  it('reschedule notifies an already-accepted umpire that the time changed', async () => {
    const fixture = await service.schedule(
      organizerId,
      tournamentId,
      input({ umpireEmails: ['umpire@example.com'] }),
    );
    await assignmentRepo.upsertStatus(fixture.id, umpireId, 'accepted');
    notificationRepo.rows.clear();

    await service.reschedule(organizerId, fixture.id, {
      startsAt: '2026-08-06T09:00:00Z',
      durationMinutes: 240,
    });

    const umpireNotifs = [...notificationRepo.rows.values()].filter(
      (n) => n.userId === umpireId && n.type === 'fixture_rescheduled',
    );
    expect(umpireNotifs).toHaveLength(1);
    expect(umpireNotifs[0]!.body).toContain('Falcons');
    expect(umpireNotifs[0]!.payload).toMatchObject({ forRole: 'umpire' });
  });

  it("refuses a reschedule that clashes with an accepted umpire's other match", async () => {
    const f1 = await service.schedule(
      organizerId,
      tournamentId,
      input({ umpireEmails: ['umpire@example.com'] }),
    );
    await assignmentRepo.upsertStatus(f1.id, umpireId, 'accepted');
    const f2 = await service.schedule(
      organizerId,
      tournamentId,
      input({ startsAt: '2026-08-05T18:00:00Z', umpireEmails: ['umpire@example.com'] }),
    );
    await assignmentRepo.upsertStatus(f2.id, umpireId, 'accepted');

    await expect(
      service.reschedule(organizerId, f2.id, {
        startsAt: '2026-08-05T10:00:00Z',
        durationMinutes: 240,
      }),
    ).rejects.toMatchObject({ code: 'UMPIRE_CONFLICT' });
    const reloaded = await fixtureRepo.findById(f2.id);
    expect(reloaded!.startsAt.toISOString()).toBe('2026-08-05T18:00:00.000Z');
  });

  it('refuses to schedule with a ground at a time outside its availability', async () => {
    const narrowGround = await groundRepo.create(ownerId, {
      name: 'Twilight Oval',
      location: 'Chennai',
      capacity: 50,
      facilities: [],
      availabilityRules: [{ days: 'all', from: '06:00', to: '10:00' }],
    });
    fixtureRepo.groundNames.set(narrowGround.id, 'Twilight Oval');
    await expect(
      service.schedule(
        organizerId,
        tournamentId,
        input({ groundId: narrowGround.id, startsAt: '2026-08-05T14:00:00Z' }),
      ),
    ).rejects.toMatchObject({ code: 'OUTSIDE_AVAILABILITY' });
  });

  it('reschedule can switch the ground: cancels the old booking, books the new ground', async () => {
    const otherGround = await groundRepo.create(ownerId, {
      name: 'Riverside',
      location: 'Pune',
      capacity: 200,
      facilities: [],
      availabilityRules: [{ days: 'all', from: '00:00', to: '23:59' }],
    });
    fixtureRepo.groundNames.set(otherGround.id, 'Riverside');

    const fixture = await service.schedule(organizerId, tournamentId, input());
    const updated = await service.reschedule(organizerId, fixture.id, {
      startsAt: '2026-08-06T09:00:00Z',
      durationMinutes: 240,
      groundId: otherGround.id,
    });

    expect(updated.groundId).toBe(otherGround.id);
    const oldGroundBookings = await bookingRepo.listForGround(groundId);
    expect(oldGroundBookings.every((b) => b.status === 'cancelled')).toBe(true);
    const newGroundBookings = await bookingRepo.listForGround(otherGround.id);
    expect(newGroundBookings).toHaveLength(1);
    expect(newGroundBookings[0]!.status).toBe('requested');
  });

  it('reschedule with groundId: null clears the ground and books nothing', async () => {
    const fixture = await service.schedule(organizerId, tournamentId, input());
    const updated = await service.reschedule(organizerId, fixture.id, {
      startsAt: '2026-08-06T09:00:00Z',
      durationMinutes: 240,
      groundId: null,
    });
    expect(updated.groundId).toBeNull();
    const oldGroundBookings = await bookingRepo.listForGround(groundId);
    expect(oldGroundBookings.every((b) => b.status === 'cancelled')).toBe(true);
  });

  it('reschedule refuses a time outside the (possibly new) ground availability', async () => {
    const narrowGround = await groundRepo.create(ownerId, {
      name: 'Twilight Oval',
      location: 'Chennai',
      capacity: 50,
      facilities: [],
      availabilityRules: [{ days: 'all', from: '06:00', to: '10:00' }],
    });
    fixtureRepo.groundNames.set(narrowGround.id, 'Twilight Oval');
    const fixture = await service.schedule(organizerId, tournamentId, input());
    await expect(
      service.reschedule(organizerId, fixture.id, {
        startsAt: '2026-08-06T14:00:00Z',
        durationMinutes: 240,
        groundId: narrowGround.id,
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_AVAILABILITY' });
    const reloaded = await fixtureRepo.findById(fixture.id);
    expect(reloaded!.groundId).toBe(groundId);
    expect(reloaded!.startsAt.toISOString()).toBe('2026-08-05T09:00:00.000Z');
  });

  describe('a match must fall inside the tournament dates', () => {
    it('refuses a match before the tournament starts', async () => {
      await expect(
        service.schedule(organizerId, tournamentId, input({ startsAt: '2026-07-31T09:00:00Z' })),
      ).rejects.toMatchObject({ code: 'OUTSIDE_TOURNAMENT_DATES' });
    });

    it('refuses a match after the tournament ends', async () => {
      await expect(
        service.schedule(organizerId, tournamentId, input({ startsAt: '2026-08-31T09:00:00Z' })),
      ).rejects.toMatchObject({ code: 'OUTSIDE_TOURNAMENT_DATES' });
    });

    it('allows a match on the closing day (compared by date, not instant)', async () => {
      const fixture = await service.schedule(
        organizerId,
        tournamentId,
        input({ startsAt: '2026-08-30T09:00:00Z' }),
      );
      expect(fixture.startsAt).toBe('2026-08-30T09:00:00.000Z');
    });

    it('refuses a match whose duration runs past the closing day', async () => {
      await expect(
        service.schedule(
          organizerId,
          tournamentId,
          input({ startsAt: '2026-08-30T23:00:00Z', durationMinutes: 240 }),
        ),
      ).rejects.toMatchObject({ code: 'OUTSIDE_TOURNAMENT_DATES' });
    });

    it('refuses a reschedule that moves a match outside the window', async () => {
      const fixture = await service.schedule(organizerId, tournamentId, input());
      await expect(
        service.reschedule(organizerId, fixture.id, {
          startsAt: '2026-09-15T09:00:00Z',
          durationMinutes: 240,
        }),
      ).rejects.toMatchObject({ code: 'OUTSIDE_TOURNAMENT_DATES' });
      const reloaded = await fixtureRepo.findById(fixture.id);
      expect(reloaded!.startsAt.toISOString()).toBe('2026-08-05T09:00:00.000Z');
    });
  });
});
