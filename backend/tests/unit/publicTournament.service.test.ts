import { beforeEach, describe, expect, it } from 'vitest';
import { PublicTournamentService } from '../../src/modules/tournaments/public.service';
import type { TournamentDetailRow } from '../../src/modules/tournaments/tournament.repo';
import { FakeStorageAdapter, FakeTournamentRepo } from '../helpers/fakes';

function detailRow(
  id: string,
  status: 'draft' | 'published' | 'closed',
  organizerId = 'organizer-1',
): TournamentDetailRow {
  return {
    id,
    organizerId,
    name: `Tournament ${id}`,
    description: null,
    structure: 'round_robin',
    teamSelectionMode: 'prebuilt_rosters',
    ageGroups: [
      {
        id: `tag-${id}`,
        ageGroupId: 'age-open',
        name: 'Open',
        bornAfter: null,
        bornBefore: null,
        genderCategory: 'mixed',
        registrationStartDate: new Date('2026-06-01'),
        registrationEndDate: new Date('2026-06-30'),
        capacity: null,
        registeredCount: 0,
        format: 'T20',
        entryFee: null,
        oversPerInnings: 20,
      },
    ],
    status,
    startDate: new Date('2026-07-01'),
    endDate: new Date('2026-08-15'),
    rules: null,
    rulesDocumentKey: null,
    prizePoolAmount: null,
    prizePoolDescription: null,
    locationCity: null,
    locationState: null,
    surfaceTypeName: null,
    maxMarqueePlayers: null,
    capacity: null,
    registeredCount: 4,
    organizerName: 'Olivia',
    organizerAcademyName: null,
    teamsCount: 4,
    fixtureDates: ['2026-07-05'],
    fixtures: [
      {
        id: 'f1',
        homeTeamName: 'Falcons',
        awayTeamName: 'Tigers',
        groundName: 'Sunrise Ground',
        startsAt: new Date('2026-07-05T09:00:00Z'),
        durationMinutes: 480,
        result: {
          homeScore: '182/6',
          awayScore: '164/9',
          winnerTeamName: 'Falcons',
          homeRunsTotal: null,
          awayRunsTotal: null,
          homePlayerScores: [],
          awayPlayerScores: [],
        },
      },
    ],
    standings: [{ teamName: 'Falcons', played: 1, won: 1, lost: 0, drawn: 0, points: 2 }],
  };
}

describe('PublicTournamentService', () => {
  let repo: FakeTournamentRepo;
  let service: PublicTournamentService;

  beforeEach(() => {
    repo = new FakeTournamentRepo();
    service = new PublicTournamentService(repo, new FakeStorageAdapter());
    for (const [id, status] of [
      ['t-pub', 'published'],
      ['t-closed', 'closed'],
      ['t-draft', 'draft'],
    ] as const) {
      const row = detailRow(id, status);
      repo.summaries.push(row);
      repo.details.set(id, row);
    }
  });

  it('lists published and closed tournaments — never drafts', async () => {
    const list = await service.list();
    expect(list.map((t) => t.id).sort()).toEqual(['t-closed', 't-pub']);
  });

  it('serves the detail of a published tournament with fixtures, results, standings', async () => {
    const detail = await service.detail('t-pub');
    expect(detail.fixtures).toHaveLength(1);
    expect(detail.fixtures[0]!.result!.winnerTeam).toBe('Falcons');
    expect(detail.standings[0]!.points).toBe(2);
  });

  it('a draft by id is a plain 404 — indistinguishable from a missing tournament', async () => {
    const draft = await service.detail('t-draft').catch((e: unknown) => e);
    const missing = await service.detail('t-nope').catch((e: unknown) => e);
    expect(draft).toMatchObject({ status: 404 });
    expect(missing).toMatchObject({ status: 404 });
    expect((draft as Error).message).toBe((missing as Error).message);
  });

  it("still 404s a draft for a signed-in viewer who isn't its organizer", async () => {
    await expect(service.detail('t-draft', 'someone-else')).rejects.toMatchObject({ status: 404 });
  });

  it("previews a draft to its own organizer, status included as 'draft'", async () => {
    const detail = await service.detail('t-draft', 'organizer-1');
    expect(detail.status).toBe('draft');
    expect(detail.fixtures).toHaveLength(1);
  });
});
