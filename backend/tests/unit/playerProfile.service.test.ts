import { beforeEach, describe, expect, it } from 'vitest';
import { PlayerProfileService } from '../../src/modules/players/playerProfile.service';
import { FakePlayerProfileRepo, FakeStorageAdapter } from '../helpers/fakes';

describe('PlayerProfileService', () => {
  let repo: FakePlayerProfileRepo;
  let service: PlayerProfileService;

  beforeEach(() => {
    repo = new FakePlayerProfileRepo();
    service = new PlayerProfileService({ players: repo, storage: new FakeStorageAdapter() });
  });

  it('404s for an unknown player', async () => {
    await expect(service.getProfile('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('returns empty tournaments for a player with no team memberships', async () => {
    repo.usersById.set('u1', { id: 'u1', name: 'Pat Player' });
    const profile = await service.getProfile('u1');
    expect(profile.name).toBe('Pat Player');
    expect(profile.tournaments).toEqual([]);
  });

  it('computes per-tournament team-level played/won/lost, counting only matches since the player joined', async () => {
    repo.usersById.set('u1', { id: 'u1', name: 'Pat Player' });
    repo.memberships.set('u1', [
      {
        tournamentId: 't1',
        tournamentName: 'Premier League',
        teamId: 'team-a',
        teamName: 'Falcons',
        roleInTeam: 'captain',
        joinedAt: new Date('2026-02-01'),
      },
    ]);
    repo.outcomes.set('t1:team-a', [
      {
        homeTeamId: 'team-a',
        awayTeamId: 'team-b',
        winnerTeamId: 'team-a',
        startsAt: new Date('2026-02-05'),
      },
      {
        homeTeamId: 'team-a',
        awayTeamId: 'team-c',
        winnerTeamId: 'team-c',
        startsAt: new Date('2026-02-10'),
      },
      {
        homeTeamId: 'team-d',
        awayTeamId: 'team-a',
        winnerTeamId: null,
        startsAt: new Date('2026-02-15'),
      },
    ]);

    const profile = await service.getProfile('u1');
    expect(profile.tournaments).toHaveLength(1);
    expect(profile.tournaments[0]).toMatchObject({
      tournamentName: 'Premier League',
      teamName: 'Falcons',
      roleInTeam: 'captain',
      played: 3,
      won: 1,
      lost: 1,
      runsScored: 0,
    });
  });

  it('excludes matches played before the player joined the roster', async () => {
    repo.usersById.set('u1', { id: 'u1', name: 'Kabir Sharma' });
    repo.memberships.set('u1', [
      {
        tournamentId: 't1',
        tournamentName: 'Premier League',
        teamId: 'team-a',
        teamName: 'Falcons',
        roleInTeam: 'player',
        joinedAt: new Date('2026-08-21'),
      },
    ]);
    repo.outcomes.set('t1:team-a', [
      {
        homeTeamId: 'team-a',
        awayTeamId: 'team-b',
        winnerTeamId: 'team-a',
        startsAt: new Date('2026-07-01'),
      },
      {
        homeTeamId: 'team-a',
        awayTeamId: 'team-c',
        winnerTeamId: 'team-c',
        startsAt: new Date('2026-08-25'),
      },
    ]);

    const profile = await service.getProfile('u1');
    expect(profile.tournaments[0]).toMatchObject({ played: 1, won: 0, lost: 1 });
  });

  it('includes runs scored within the tournament, defaulting to 0 when never individually scored', async () => {
    repo.usersById.set('u1', { id: 'u1', name: 'Pat Player' });
    repo.memberships.set('u1', [
      {
        tournamentId: 't1',
        tournamentName: 'Premier League',
        teamId: 'team-a',
        teamName: 'Falcons',
        roleInTeam: 'captain',
        joinedAt: new Date('2026-01-01'),
      },
    ]);
    repo.runs.set('t1:u1', 137);

    const profile = await service.getProfile('u1');
    expect(profile.tournaments[0]!.runsScored).toBe(137);
  });
});
