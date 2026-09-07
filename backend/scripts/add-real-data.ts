import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function utc(y: number, m: number, d: number, h = 0, min = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, h, min, 0, 0));
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

async function main() {
  const organizerId = 'user-organizer';
  const groundOwnerId = 'user-groundowner';
  const umpireA = 'user-umpire';
  const umpireB = 'user-player-2';

  await prisma.ground.upsert({
    where: { id: 'ground-new-silveroak' },
    create: {
      id: 'ground-new-silveroak',
      name: 'Silver Oak Cricket Ground',
      location: 'Chennai',
      capacity: 4000,
      facilities: ['floodlights', 'pavilion'],
      availabilityRules: [{ days: 'all', from: '06:00', to: '21:00' }],
      ownerId: groundOwnerId,
    },
    update: {},
  });
  await prisma.ground.upsert({
    where: { id: 'ground-new-gardencity' },
    create: {
      id: 'ground-new-gardencity',
      name: 'Garden City Cricket Arena',
      location: 'Bengaluru',
      capacity: 6500,
      facilities: ['floodlights', 'pavilion', 'practice nets', 'parking'],
      availabilityRules: [{ days: 'mon,tue,wed,thu,fri', from: '07:00', to: '19:00' }],
      ownerId: groundOwnerId,
    },
    update: {},
  });
  await prisma.ground.upsert({
    where: { id: 'ground-new-pinkcity' },
    create: {
      id: 'ground-new-pinkcity',
      name: 'Pink City Cricket Ground',
      location: 'Jaipur',
      capacity: 3200,
      facilities: ['nets', 'pavilion'],
      availabilityRules: [
        {
          days: 'sat,sun',
          from: '06:00',
          to: '20:00',
          startDate: '2026-08-07',
          endDate: '2026-12-31',
        },
      ],
      ownerId: groundOwnerId,
    },
    update: {},
  });
  console.log(
    'Seeded 3 new grounds: Silver Oak (Chennai), Garden City (Bengaluru), Pink City (Jaipur)',
  );

  const T = {
    falcons: 'team-falcons',
    tigers: 'team-tigers',
    panthers: 'team-panthers',
    eagles: 'team-eagles',
    kolkata: 'team-kolkata',
    jaipur: 'team-jaipur',
  };

  const G = {
    deccan: 'ground-demo',
    yuva: 'ground-demo-2',
    westcoast: 'ground-demo-3',
    silveroak: 'ground-new-silveroak',
    gardencity: 'ground-new-gardencity',
    pinkcity: 'ground-new-pinkcity',
  };

  async function registerTeams(tournamentId: string, teamIds: string[]) {
    for (const teamId of teamIds) {
      const existing = await prisma.registration.findFirst({
        where: { tournamentId, teamId, status: 'active' },
      });
      if (!existing) {
        await prisma.registration.create({ data: { tournamentId, teamId, status: 'active' } });
      }
    }
  }

  interface FixtureDef {
    id: string;
    tournamentId: string;
    home: string;
    away: string;
    startsAt: Date;
    durationMinutes: number;
    groundId: string | null;
    umpire?: { userId: string; status: 'applied' | 'invited' | 'accepted' | 'declined' };
    result?: { homeScore: string; awayScore: string; winnerTeamId: string | null };
  }

  async function seedFixture(f: FixtureDef) {
    await prisma.fixture.upsert({
      where: { id: f.id },
      create: {
        id: f.id,
        tournamentId: f.tournamentId,
        homeTeamId: f.home,
        awayTeamId: f.away,
        groundId: f.groundId,
        startsAt: f.startsAt,
        durationMinutes: f.durationMinutes,
      },
      update: {},
    });
    if (f.groundId) {
      const booking = {
        groundId: f.groundId,
        requesterId: organizerId,
        fixtureId: f.id,
        startsAt: f.startsAt,
        endsAt: addMinutes(f.startsAt, f.durationMinutes),
        status: 'confirmed' as const,
      };
      await prisma.groundBooking.upsert({
        where: { id: `booking-${f.id}` },
        create: { id: `booking-${f.id}`, ...booking },
        update: {},
      });
    }
    if (f.umpire) {
      await prisma.umpireAssignment.upsert({
        where: { fixtureId_umpireId: { fixtureId: f.id, umpireId: f.umpire.userId } },
        create: { fixtureId: f.id, umpireId: f.umpire.userId, status: f.umpire.status },
        update: {},
      });
    }
    if (f.result) {
      await prisma.result.upsert({
        where: { fixtureId: f.id },
        create: { fixtureId: f.id, ...f.result, enteredById: organizerId },
        update: {},
      });
    }
  }

  const coastalId = 't-coastal-championship';
  await prisma.tournament.upsert({
    where: { id: coastalId },
    create: {
      id: coastalId,
      name: 'Coastal Cricket Championship',
      format: 'T20',
      ageGroupId: 'age-open',
      startDate: utc(2026, 7, 20),
      endDate: utc(2026, 8, 25),
      capacity: 8,
      status: 'published',
      organizerId,
    },
    update: {},
  });
  await registerTeams(coastalId, [T.falcons, T.tigers, T.panthers, T.eagles, T.kolkata, T.jaipur]);
  const coastalFixtures: FixtureDef[] = [
    {
      id: 'cf-coastal-1',
      tournamentId: coastalId,
      home: T.falcons,
      away: T.tigers,
      startsAt: utc(2026, 7, 26, 9, 0),
      durationMinutes: 210,
      groundId: G.westcoast,
      umpire: { userId: umpireA, status: 'accepted' },
      result: { homeScore: '178/5 (20 ov)', awayScore: '162/8 (20 ov)', winnerTeamId: T.falcons },
    },
    {
      id: 'cf-coastal-2',
      tournamentId: coastalId,
      home: T.panthers,
      away: T.eagles,
      startsAt: utc(2026, 7, 30, 14, 0),
      durationMinutes: 210,
      groundId: G.yuva,
      umpire: { userId: umpireA, status: 'accepted' },
      result: { homeScore: '145/9 (20 ov)', awayScore: '148/4 (18.2 ov)', winnerTeamId: T.eagles },
    },
    {
      id: 'cf-coastal-3',
      tournamentId: coastalId,
      home: T.kolkata,
      away: T.jaipur,
      startsAt: utc(2026, 8, 2, 9, 0),
      durationMinutes: 210,
      groundId: G.silveroak,
      umpire: { userId: umpireA, status: 'accepted' },
      result: { homeScore: '191/3 (20 ov)', awayScore: '173/7 (20 ov)', winnerTeamId: T.kolkata },
    },
    {
      id: 'cf-coastal-4',
      tournamentId: coastalId,
      home: T.falcons,
      away: T.panthers,
      startsAt: utc(2026, 8, 13, 9, 0),
      durationMinutes: 210,
      groundId: G.westcoast,
      umpire: { userId: umpireA, status: 'invited' },
    },
    {
      id: 'cf-coastal-5',
      tournamentId: coastalId,
      home: T.tigers,
      away: T.kolkata,
      startsAt: utc(2026, 8, 18, 14, 0),
      durationMinutes: 210,
      groundId: G.yuva,
      umpire: { userId: umpireB, status: 'applied' },
    },
    {
      id: 'cf-coastal-6',
      tournamentId: coastalId,
      home: T.eagles,
      away: T.jaipur,
      startsAt: utc(2026, 8, 24, 9, 0),
      durationMinutes: 210,
      groundId: G.silveroak,
      umpire: { userId: umpireB, status: 'accepted' },
    },
  ];
  for (const f of coastalFixtures) await seedFixture(f);

  {
    const teamIds = [T.falcons, T.tigers, T.panthers, T.eagles, T.kolkata, T.jaipur];
    const table = new Map<
      string,
      { played: number; won: number; lost: number; drawn: number; points: number }
    >();
    for (const id of teamIds) table.set(id, { played: 0, won: 0, lost: 0, drawn: 0, points: 0 });
    const completed = coastalFixtures.filter((f) => f.result);
    for (const f of completed) {
      for (const teamId of [f.home, f.away]) {
        const row = table.get(teamId)!;
        row.played += 1;
        if (f.result!.winnerTeamId === null) {
          row.drawn += 1;
          row.points += 1;
        } else if (f.result!.winnerTeamId === teamId) {
          row.won += 1;
          row.points += 2;
        } else {
          row.lost += 1;
        }
      }
    }
    await prisma.standing.deleteMany({ where: { tournamentId: coastalId } });
    await prisma.standing.createMany({
      data: [...table.entries()].map(([teamId, row]) => ({
        tournamentId: coastalId,
        teamId,
        ...row,
      })),
    });
  }
  console.log('Seeded Coastal Cricket Championship (6 fixtures, 3 results, standings)');

  const metroId = 't-metro-t10-blitz';
  await prisma.tournament.upsert({
    where: { id: metroId },
    create: {
      id: metroId,
      name: 'Metro T10 Blitz',
      format: 'T10',
      ageGroupId: 'age-open',
      startDate: utc(2026, 8, 20),
      endDate: utc(2026, 9, 3),
      capacity: 6,
      status: 'published',
      organizerId,
    },
    update: {},
  });
  await registerTeams(metroId, [T.falcons, T.tigers, T.panthers, T.eagles]);
  const metroFixtures: FixtureDef[] = [
    {
      id: 'cf-metro-1',
      tournamentId: metroId,
      home: T.falcons,
      away: T.eagles,
      startsAt: utc(2026, 8, 22, 15, 0),
      durationMinutes: 180,
      groundId: G.silveroak,
      umpire: { userId: umpireA, status: 'invited' },
    },
    {
      id: 'cf-metro-2',
      tournamentId: metroId,
      home: T.tigers,
      away: T.panthers,
      startsAt: utc(2026, 8, 25, 8, 0),
      durationMinutes: 180,
      groundId: G.gardencity,
    },
    {
      id: 'cf-metro-3',
      tournamentId: metroId,
      home: T.falcons,
      away: T.panthers,
      startsAt: utc(2026, 8, 28, 8, 0),
      durationMinutes: 180,
      groundId: G.gardencity,
      umpire: { userId: umpireB, status: 'applied' },
    },
    {
      id: 'cf-metro-4',
      tournamentId: metroId,
      home: T.tigers,
      away: T.eagles,
      startsAt: utc(2026, 9, 1, 8, 0),
      durationMinutes: 180,
      groundId: G.gardencity,
      umpire: { userId: umpireA, status: 'invited' },
    },
  ];
  for (const f of metroFixtures) await seedFixture(f);
  console.log('Seeded Metro T10 Blitz (4 upcoming fixtures)');

  const juniorId = 't-junior-champions-trophy';
  await prisma.tournament.upsert({
    where: { id: juniorId },
    create: {
      id: juniorId,
      name: 'Junior Champions Trophy',
      format: 'One Day',
      ageGroupId: 'age-u16',
      startDate: utc(2026, 9, 5),
      endDate: utc(2026, 9, 24),
      capacity: 6,
      status: 'published',
      organizerId,
    },
    update: {},
  });
  await registerTeams(juniorId, [T.kolkata, T.jaipur, T.falcons, T.tigers]);
  const juniorFixtures: FixtureDef[] = [
    {
      id: 'cf-junior-1',
      tournamentId: juniorId,
      home: T.kolkata,
      away: T.jaipur,
      startsAt: utc(2026, 9, 6, 6, 0),
      durationMinutes: 420,
      groundId: G.pinkcity,
      umpire: { userId: umpireA, status: 'accepted' },
    },
    {
      id: 'cf-junior-2',
      tournamentId: juniorId,
      home: T.falcons,
      away: T.tigers,
      startsAt: utc(2026, 9, 12, 6, 30),
      durationMinutes: 420,
      groundId: G.pinkcity,
    },
    {
      id: 'cf-junior-3',
      tournamentId: juniorId,
      home: T.kolkata,
      away: T.falcons,
      startsAt: utc(2026, 9, 19, 6, 0),
      durationMinutes: 420,
      groundId: G.pinkcity,
      umpire: { userId: umpireB, status: 'invited' },
    },
    {
      id: 'cf-junior-4',
      tournamentId: juniorId,
      home: T.jaipur,
      away: T.tigers,
      startsAt: utc(2026, 9, 20, 6, 0),
      durationMinutes: 420,
      groundId: G.pinkcity,
      umpire: { userId: umpireA, status: 'applied' },
    },
  ];
  for (const f of juniorFixtures) await seedFixture(f);
  console.log('Seeded Junior Champions Trophy (4 upcoming fixtures)');

  const foundersId = 't-founders-cup';
  await prisma.tournament.upsert({
    where: { id: foundersId },
    create: {
      id: foundersId,
      name: 'Founders Cup',
      format: 'T20',
      ageGroupId: 'age-open',
      startDate: utc(2026, 9, 20),
      endDate: utc(2026, 10, 8),
      capacity: 8,
      status: 'draft',
      organizerId,
    },
    update: {},
  });
  console.log('Seeded Founders Cup (draft, unpublished — no teams yet)');

  const autumnId = 't-autumn-invitational';
  await prisma.tournament.upsert({
    where: { id: autumnId },
    create: {
      id: autumnId,
      name: 'Autumn Invitational',
      format: 'T20',
      ageGroupId: 'age-u19',
      startDate: utc(2026, 10, 5),
      endDate: utc(2026, 10, 25),
      capacity: 6,
      status: 'published',
      organizerId,
    },
    update: {},
  });
  await registerTeams(autumnId, [T.eagles, T.panthers, T.jaipur, T.kolkata]);
  const autumnFixtures: FixtureDef[] = [
    {
      id: 'cf-autumn-1',
      tournamentId: autumnId,
      home: T.eagles,
      away: T.panthers,
      startsAt: utc(2026, 10, 9, 9, 0),
      durationMinutes: 210,
      groundId: G.deccan,
      umpire: { userId: umpireA, status: 'invited' },
    },
    {
      id: 'cf-autumn-2',
      tournamentId: autumnId,
      home: T.jaipur,
      away: T.kolkata,
      startsAt: utc(2026, 10, 14, 9, 0),
      durationMinutes: 210,
      groundId: G.deccan,
    },
    {
      id: 'cf-autumn-3',
      tournamentId: autumnId,
      home: T.eagles,
      away: T.jaipur,
      startsAt: utc(2026, 10, 20, 9, 0),
      durationMinutes: 210,
      groundId: G.deccan,
      umpire: { userId: umpireB, status: 'accepted' },
    },
    {
      id: 'cf-autumn-4',
      tournamentId: autumnId,
      home: T.panthers,
      away: T.kolkata,
      startsAt: utc(2026, 10, 24, 9, 0),
      durationMinutes: 210,
      groundId: G.deccan,
      umpire: { userId: umpireA, status: 'invited' },
    },
  ];
  for (const f of autumnFixtures) await seedFixture(f);
  console.log('Seeded Autumn Invitational (4 upcoming fixtures)');

  console.log('\nDone. Added 5 tournaments (4 published + 1 draft) and 3 grounds.');
  console.log(
    'Existing demo data (tournament-demo, Sunset Sixes, Winter Cup, original 3 grounds) untouched.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
