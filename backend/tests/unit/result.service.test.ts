import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { ResultService } from '../../src/modules/results/result.service';
import { computeStandings } from '../../src/modules/results/standings';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import {
  FakeAudit,
  FakeNotificationRepo,
  FakeOrganizerTournamentRepo,
  FakeResultRepo,
  FakeTeamRepo,
  FakeUserRepo,
  MailboxAdapter,
  fakeTx,
} from '../helpers/fakes';

describe('computeStandings', () => {
  it('awards 2 for a win, 1 each for a draw, 0 for a loss', () => {
    const rows = computeStandings(
      ['a', 'b', 'c'],
      [
        { homeTeamId: 'a', awayTeamId: 'b', winnerTeamId: 'a' },
        { homeTeamId: 'a', awayTeamId: 'c', winnerTeamId: null },
      ],
    );
    const byId = Object.fromEntries(rows.map((r) => [r.teamId, r]));
    expect(byId.a).toMatchObject({ played: 2, won: 1, drawn: 1, lost: 0, points: 3 });
    expect(byId.b).toMatchObject({ played: 1, won: 0, drawn: 0, lost: 1, points: 0 });
    expect(byId.c).toMatchObject({ played: 1, won: 0, drawn: 1, lost: 0, points: 1 });
  });
});

describe('ResultService', () => {
  let users: FakeUserRepo;
  let resultRepo: FakeResultRepo;
  let tournamentRepo: FakeOrganizerTournamentRepo;
  let teamsRepo: FakeTeamRepo;
  let service: ResultService;
  let audit: FakeAudit;
  let mailbox: MailboxAdapter;
  let notificationRepo: FakeNotificationRepo;
  let organizerId: string;
  let otherOrganizerId: string;
  let managerId: string;
  let tournamentId: string;

  beforeEach(async () => {
    users = new FakeUserRepo();
    resultRepo = new FakeResultRepo(users);
    tournamentRepo = new FakeOrganizerTournamentRepo();
    teamsRepo = new FakeTeamRepo(users);
    mailbox = new MailboxAdapter();
    notificationRepo = new FakeNotificationRepo();
    const notifications = new NotificationService({
      notifications: notificationRepo,
      users,
      email: mailbox,
    });
    audit = new FakeAudit();
    service = new ResultService({
      results: resultRepo,
      tournaments: tournamentRepo,
      teams: teamsRepo,
      notifications,
      authz: new AuthzService(users),
      audit,
      tx: fakeTx,
    });

    const mk = async (email: string, roleIds: number[]) =>
      (await users.create({ name: email, email, passwordHash: await hash('x'), roleIds })).id;
    organizerId = await mk('organizer@example.com', [2]);
    otherOrganizerId = await mk('other@example.com', [2]);
    managerId = await mk('manager@example.com', [4]);

    const t = await tournamentRepo.create(organizerId, {
      name: 'Cup',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-30'),
      capacity: 8,
    });
    tournamentId = t.id;
    await tournamentRepo.updateStatus(tournamentId, 'published');

    resultRepo.registered.set(tournamentId, ['team-a', 'team-b']);
    resultRepo.contexts.set('fixture-1', {
      tournamentId,
      tournamentName: 'Cup',
      homeTeamId: 'team-a',
      homeTeamName: 'Team A',
      awayTeamId: 'team-b',
      awayTeamName: 'Team B',
      homeManagerId: managerId,
      awayManagerId: managerId,
      startsAt: new Date('2026-08-05T09:00:00.000Z'),
      ageGroupLabel: null,
    });
  });

  it('only the owning organizer (or admin) can enter a result', async () => {
    await expect(
      service.enter(otherOrganizerId, 'fixture-1', {
        homeScore: '150',
        awayScore: '140',
        winnerTeamId: 'team-a',
      }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('rejects a winner that is not one of the two teams', async () => {
    await expect(
      service.enter(organizerId, 'fixture-1', {
        homeScore: '150',
        awayScore: '140',
        winnerTeamId: 'team-x',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_WINNER' });
  });

  it('records a result and rebuilds standings', async () => {
    await service.enter(organizerId, 'fixture-1', {
      homeScore: '150',
      awayScore: '140',
      winnerTeamId: 'team-a',
    });
    const standings = resultRepo.standings.get(tournamentId)!;
    const byId = Object.fromEntries(standings.map((s) => [s.teamId, s]));
    expect(byId['team-a']).toMatchObject({ won: 1, points: 2 });
    expect(byId['team-b']).toMatchObject({ lost: 1, points: 0 });
  });

  it('notifies both managers with a rich, specific match-result email (tournament, teams, score, winner)', async () => {
    await service.enter(organizerId, 'fixture-1', {
      homeScore: '150/7',
      awayScore: '140/9',
      winnerTeamId: 'team-a',
    });

    const inApp = [...notificationRepo.rows.values()].filter((n) => n.type === 'result_posted');
    expect(inApp).toHaveLength(1);
    expect(inApp[0]).toMatchObject({
      title: 'Match result posted: Cup',
      body: 'Team A won: Team A 150/7 – Team B 140/9.',
    });

    expect(mailbox.notifications).toHaveLength(1);
    expect(mailbox.notifications[0]).toMatchObject({
      subject: 'Match result posted: Cup',
      infoCard: {
        title: 'Match result',
        rows: [
          { label: 'Tournament', value: 'Cup' },
          { label: 'Match', value: 'Team A vs Team B' },
          { label: 'Team A score', value: '150/7' },
          { label: 'Team B score', value: '140/9' },
          { label: 'Result', value: 'Team A won' },
          { label: 'Played', value: 'Aug 5, 2026, 9:00 AM' },
        ],
      },
    });
  });

  it('notifies of a draw without naming either team as the winner', async () => {
    await service.enter(organizerId, 'fixture-1', {
      homeScore: '180',
      awayScore: '180',
      winnerTeamId: null,
    });
    expect(mailbox.notifications[0]).toMatchObject({
      infoCard: { rows: expect.arrayContaining([{ label: 'Result', value: 'Match drawn' }]) },
    });
  });

  it('re-entering a result updates in place (no duplicate) and standings never go stale', async () => {
    await service.enter(organizerId, 'fixture-1', {
      homeScore: '150',
      awayScore: '140',
      winnerTeamId: 'team-a',
    });
    await service.enter(organizerId, 'fixture-1', {
      homeScore: '140',
      awayScore: '150',
      winnerTeamId: 'team-b',
    });
    expect(resultRepo.results.size).toBe(1);
    const byId = Object.fromEntries(
      resultRepo.standings.get(tournamentId)!.map((s) => [s.teamId, s]),
    );
    expect(byId['team-a']).toMatchObject({ won: 0, lost: 1, points: 0 });
    expect(byId['team-b']).toMatchObject({ won: 1, lost: 0, points: 2 });

    const entries = audit.actionsOf('result.entered');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      meta: { isCorrection: false, homeScore: '150', awayScore: '140' },
    });
    expect(entries[1]).toMatchObject({
      meta: {
        isCorrection: true,
        homeScore: '140',
        awayScore: '150',
        winnerTeamId: 'team-b',
        previousHomeScore: '150',
        previousAwayScore: '140',
        previousWinnerTeamId: 'team-a',
      },
    });
  });

  describe('individual player scores', () => {
    let batterId: string;
    let bowlerId: string;

    beforeEach(async () => {
      batterId = (
        await users.create({
          name: 'Batter',
          email: 'batter@example.com',
          passwordHash: 'x',
          roleIds: [3],
        })
      ).id;
      bowlerId = (
        await users.create({
          name: 'Bowler',
          email: 'bowler@example.com',
          passwordHash: 'x',
          roleIds: [3],
        })
      ).id;
    });

    it('stores per-player runs/wickets and defaults the total to their sum when omitted', async () => {
      const result = await service.enter(organizerId, 'fixture-1', {
        homeScore: '150/3',
        awayScore: '140',
        winnerTeamId: 'team-a',
        homePlayerScores: [{ userId: batterId, runs: 90, wickets: 0 }],
      });
      expect(result.homeRunsTotal).toBe(90);
      expect(result.homePlayerScores).toEqual([
        { userId: batterId, playerName: 'Batter', runs: 90, wickets: 0 },
      ]);
      expect(result.awayPlayerScores).toEqual([]);
    });

    it('accepts an explicit total that exceeds the sum (extras)', async () => {
      const result = await service.enter(organizerId, 'fixture-1', {
        homeScore: '150/3',
        awayScore: '140',
        winnerTeamId: 'team-a',
        homePlayerScores: [{ userId: batterId, runs: 90, wickets: 0 }],
        homeRunsTotal: 150,
      });
      expect(result.homeRunsTotal).toBe(150);
    });

    it('rejects player scores that exceed the entered total', async () => {
      await expect(
        service.enter(organizerId, 'fixture-1', {
          homeScore: '150/3',
          awayScore: '140',
          winnerTeamId: 'team-a',
          homePlayerScores: [{ userId: batterId, runs: 90, wickets: 0 }],
          homeRunsTotal: 50,
        }),
      ).rejects.toMatchObject({ code: 'PLAYER_SCORES_EXCEED_TOTAL' });
    });

    it('rejects the same player scored twice on one side', async () => {
      await expect(
        service.enter(organizerId, 'fixture-1', {
          homeScore: '150/3',
          awayScore: '140',
          winnerTeamId: 'team-a',
          homePlayerScores: [
            { userId: batterId, runs: 40, wickets: 0 },
            { userId: batterId, runs: 10, wickets: 0 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'DUPLICATE_PLAYER_SCORE' });
    });

    it('rejects the same player credited on both sides', async () => {
      await expect(
        service.enter(organizerId, 'fixture-1', {
          homeScore: '150/3',
          awayScore: '140',
          winnerTeamId: 'team-a',
          homePlayerScores: [{ userId: batterId, runs: 40, wickets: 0 }],
          awayPlayerScores: [{ userId: batterId, runs: 10, wickets: 0 }],
        }),
      ).rejects.toMatchObject({ code: 'PLAYER_ON_BOTH_SIDES' });
    });

    it('a correction without player scores clears any previously-entered ones', async () => {
      await service.enter(organizerId, 'fixture-1', {
        homeScore: '150/3',
        awayScore: '140',
        winnerTeamId: 'team-a',
        homePlayerScores: [{ userId: batterId, runs: 90, wickets: 0 }],
      });
      const corrected = await service.enter(organizerId, 'fixture-1', {
        homeScore: '150/3',
        awayScore: '140',
        winnerTeamId: 'team-a',
      });
      expect(corrected.homePlayerScores).toEqual([]);
      expect(corrected.homeRunsTotal).toBeNull();
    });

    it('getForFixture returns the same player-score detail as enter(), including wickets', async () => {
      await service.enter(organizerId, 'fixture-1', {
        homeScore: '150/3',
        awayScore: '140',
        winnerTeamId: 'team-a',
        homePlayerScores: [{ userId: batterId, runs: 90, wickets: 1 }],
        awayPlayerScores: [{ userId: bowlerId, runs: 20, wickets: 3 }],
      });
      const fetched = await service.getForFixture('fixture-1');
      expect(fetched!.homePlayerScores).toEqual([
        { userId: batterId, playerName: 'Batter', runs: 90, wickets: 1 },
      ]);
      expect(fetched!.awayPlayerScores).toEqual([
        { userId: bowlerId, playerName: 'Bowler', runs: 20, wickets: 3 },
      ]);
    });
  });

  describe('rostersForFixture', () => {
    it("lists each side's current ACCEPTED roster, excluding pending/declined entries", async () => {
      const homeTeam = await teamsRepo.create(managerId, 'Home XI');
      const awayTeam = await teamsRepo.create(managerId, 'Away XI');
      const accepted = (
        await users.create({
          name: 'Accepted',
          email: 'accepted@example.com',
          passwordHash: 'x',
          roleIds: [3],
        })
      ).id;
      const pending = (
        await users.create({
          name: 'Pending',
          email: 'pending@example.com',
          passwordHash: 'x',
          roleIds: [3],
        })
      ).id;
      await teamsRepo.addRosterEntry(homeTeam.id, accepted, 'player');
      await teamsRepo.setRosterStatus(homeTeam.id, accepted, 'accepted');
      await teamsRepo.addRosterEntry(homeTeam.id, pending, 'player');

      resultRepo.contexts.set('fixture-2', {
        tournamentId,
        tournamentName: 'Cup',
        homeTeamId: homeTeam.id,
        homeTeamName: 'Home XI',
        awayTeamId: awayTeam.id,
        awayTeamName: 'Away XI',
        homeManagerId: managerId,
        awayManagerId: managerId,
        startsAt: new Date('2026-08-05T09:00:00.000Z'),
        ageGroupLabel: null,
      });

      const rosters = await service.rostersForFixture(organizerId, 'fixture-2');
      expect(rosters.home.teamId).toBe(homeTeam.id);
      expect(rosters.home.players).toEqual([{ userId: accepted, name: 'Accepted' }]);
      expect(rosters.away.players).toEqual([]);
    });

    it('only the owning organizer (or admin) can view rosters', async () => {
      await expect(service.rostersForFixture(otherOrganizerId, 'fixture-1')).rejects.toMatchObject({
        code: 'NOT_ALLOWED',
      });
    });
  });
});
