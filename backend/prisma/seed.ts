import { PrismaClient, type RoleName } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'Pass1234';
const DEMO_EMAIL_DOMAIN = 'a.com';

const ROLES: { id: number; name: RoleName }[] = [
  { id: 1, name: 'platform_admin' },
  { id: 2, name: 'organizer' },
  { id: 3, name: 'player' },
  { id: 4, name: 'team_manager' },
  { id: 5, name: 'ground_owner' },
  { id: 6, name: 'umpire' },
  { id: 7, name: 'parent' },
];

const AGE_GROUPS = [
  { id: 'age-u13', name: 'U-13', minAge: null, maxAge: 13, hidden: false },
  { id: 'age-u15', name: 'U-15', minAge: null, maxAge: 15, hidden: false },
  { id: 'age-u18', name: 'U-18', minAge: null, maxAge: 18, hidden: false },
  { id: 'age-u20', name: 'U-20', minAge: null, maxAge: 20, hidden: false },
  { id: 'age-open', name: 'Open', minAge: null, maxAge: null, hidden: false },
  { id: 'age-u16', name: 'U-16', minAge: null, maxAge: 16, hidden: true },
  { id: 'age-u19', name: 'U-19', minAge: null, maxAge: 19, hidden: true },
];

const SURFACE_TYPES = [
  { id: 'surface-turf', name: 'Turf' },
  { id: 'surface-astro', name: 'Astro Turf' },
  { id: 'surface-matting', name: 'Matting' },
  { id: 'surface-cement', name: 'Cement' },
];

function daysFromNow(days: number, hourUtc = 9): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

async function upsertUser(opts: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  roles: number[];
  verified?: boolean;
  dateOfBirth?: Date;
  managedByParentId?: string;
}) {
  const user = await prisma.user.upsert({
    where: { id: opts.id },
    create: {
      id: opts.id,
      name: opts.name,
      email: opts.email,
      passwordHash: opts.passwordHash,
      verified: opts.verified ?? true,
      dateOfBirth: opts.dateOfBirth ?? null,
      managedByParentId: opts.managedByParentId ?? null,
    },
    update: {
      name: opts.name,
      email: opts.email,
      passwordHash: opts.passwordHash,
      verified: opts.verified ?? true,
      dateOfBirth: opts.dateOfBirth ?? null,
      managedByParentId: opts.managedByParentId ?? null,
    },
  });
  for (const roleId of opts.roles) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      create: { userId: user.id, roleId },
      update: {},
    });
  }
  return user;
}

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { id: role.id },
      create: role,
      update: { name: role.name },
    });
  }
  console.log(`Seeded ${ROLES.length} roles`);

  for (const ag of AGE_GROUPS) {
    await prisma.ageGroup.upsert({
      where: { id: ag.id },
      create: ag,
      update: { name: ag.name, minAge: ag.minAge, maxAge: ag.maxAge, hidden: ag.hidden },
    });
  }
  console.log(`Seeded ${AGE_GROUPS.length} age groups`);

  for (const st of SURFACE_TYPES) {
    await prisma.surfaceType.upsert({
      where: { id: st.id },
      create: st,
      update: { name: st.name },
    });
  }
  console.log(`Seeded ${SURFACE_TYPES.length} surface types`);

  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD (min 8 chars) must be set to seed the bootstrap admin');
  }
  await upsertUser({
    id: 'user-admin',
    name: 'Platform Admin',
    email: `admin@${DEMO_EMAIL_DOMAIN}`,
    passwordHash: await hash(adminPassword),
    roles: [1],
  });
  console.log(`Seeded bootstrap admin (admin@${DEMO_EMAIL_DOMAIN})`);

  const demoHash = await hash(DEMO_PASSWORD);
  const organizer = await upsertUser({
    id: 'user-organizer',
    name: 'Olivia Organizer',
    email: `organizer@${DEMO_EMAIL_DOMAIN}`,
    passwordHash: demoHash,
    roles: [2],
  });
  const captain = await upsertUser({
    id: 'user-player',
    name: 'Pat Player',
    email: `player@${DEMO_EMAIL_DOMAIN}`,
    passwordHash: demoHash,
    roles: [3],
    dateOfBirth: new Date('2000-04-12'),
  });
  const manager = await upsertUser({
    id: 'user-manager',
    name: 'Manny Manager',
    email: `manager@${DEMO_EMAIL_DOMAIN}`,
    passwordHash: demoHash,
    roles: [4],
  });
  const groundOwner = await upsertUser({
    id: 'user-groundowner',
    name: 'Gita GroundOwner',
    email: `groundowner@${DEMO_EMAIL_DOMAIN}`,
    passwordHash: demoHash,
    roles: [5],
  });
  const umpire = await upsertUser({
    id: 'user-umpire',
    name: 'Umesh Umpire',
    email: `umpire@${DEMO_EMAIL_DOMAIN}`,
    passwordHash: demoHash,
    roles: [6],
  });
  const extraPlayers = [];
  for (let i = 2; i <= 6; i++) {
    extraPlayers.push(
      await upsertUser({
        id: `user-player-${i}`,
        name: `Player ${i}`,
        email: `player${i}@${DEMO_EMAIL_DOMAIN}`,
        passwordHash: demoHash,
        roles: [3],
        dateOfBirth: new Date(`199${i}-06-0${i}`),
      }),
    );
  }
  const captainKolkata = await upsertUser({
    id: 'user-player-7',
    name: 'Arjun Mehta',
    email: `player7@${DEMO_EMAIL_DOMAIN}`,
    passwordHash: demoHash,
    roles: [3],
    dateOfBirth: new Date('1997-03-14'),
  });
  const captainJaipur = await upsertUser({
    id: 'user-player-8',
    name: 'Rohan Iyer',
    email: `player8@${DEMO_EMAIL_DOMAIN}`,
    passwordHash: demoHash,
    roles: [3],
    dateOfBirth: new Date('1998-11-02'),
  });
  console.log('Seeded demo accounts for all six roles');

  const parent = await upsertUser({
    id: 'user-parent',
    name: 'Priya Parent',
    email: `parent@${DEMO_EMAIL_DOMAIN}`,
    passwordHash: demoHash,
    roles: [7],
    dateOfBirth: new Date('1988-04-12'),
  });
  const child1 = await upsertUser({
    id: 'user-child-1',
    name: 'Aarav Sharma',
    email: 'managed-child-1@no-login.nforcearena.internal',
    passwordHash: demoHash,
    roles: [3],
    dateOfBirth: new Date('2014-05-10'),
    managedByParentId: parent.id,
  });
  const child2 = await upsertUser({
    id: 'user-child-2',
    name: 'Diya Sharma',
    email: 'managed-child-2@no-login.nforcearena.internal',
    passwordHash: demoHash,
    roles: [3],
    dateOfBirth: new Date('2016-09-22'),
    managedByParentId: parent.id,
  });
  console.log(`Seeded demo parent (parent@${DEMO_EMAIL_DOMAIN}) with 2 managed children`);

  const teamDefs = [
    { id: 'team-falcons', name: 'Mumbai Blasters' },
    { id: 'team-tigers', name: 'Chennai Chargers' },
    { id: 'team-panthers', name: 'Bengaluru Strikers' },
    { id: 'team-eagles', name: 'Hyderabad Falcons' },
  ];
  const extraTeamDefs = [
    { id: 'team-kolkata', name: 'Kolkata Panthers', captain: captainKolkata },
    { id: 'team-jaipur', name: 'Jaipur Cavaliers', captain: captainJaipur },
  ];
  for (const def of teamDefs) {
    await prisma.team.upsert({
      where: { id: def.id },
      create: { ...def, managerId: manager.id },
      update: { name: def.name },
    });
  }
  for (const def of extraTeamDefs) {
    await prisma.team.upsert({
      where: { id: def.id },
      create: { id: def.id, name: def.name, managerId: manager.id },
      update: { name: def.name },
    });
  }
  const rosterEntries = [
    { teamId: 'team-falcons', userId: captain.id, roleInTeam: 'captain' as const },
    ...extraPlayers.map((p, i) => ({
      teamId: teamDefs[(i + 1) % teamDefs.length]!.id,
      userId: p.id,
      roleInTeam: 'player' as const,
    })),
    ...extraTeamDefs.map((def) => ({
      teamId: def.id,
      userId: def.captain.id,
      roleInTeam: 'captain' as const,
    })),
  ];
  for (const entry of rosterEntries) {
    await prisma.teamRosterEntry.upsert({
      where: { teamId_userId: { teamId: entry.teamId, userId: entry.userId } },
      create: entry,
      update: { roleInTeam: entry.roleInTeam },
    });
  }
  console.log(`Seeded ${teamDefs.length + extraTeamDefs.length} teams with rosters`);

  const demoWindow = { startDate: daysFromNow(-14), endDate: daysFromNow(21) };
  const demoDetails = {
    description:
      'The flagship demo tournament — T20 league play with live fixtures, results, and standings.',
    structure: 'round_robin' as const,
    teamSelectionMode: 'prebuilt_rosters' as const,
    oversPerInnings: 20,
    rules: 'Standard ICC T20 playing conditions apply. Powerplay: overs 1-6.',
    capacity: 8,
    prizePoolAmount: 100000,
    prizePoolDescription: 'Winner takes the NForce Premier League trophy plus a cash prize.',
    locationCity: 'Los Angeles',
    locationState: 'California',
    surfaceTypeId: 'surface-turf',
    maxMarqueePlayers: 4,
    notifyOnPublish: false,
  };
  await prisma.tournament.upsert({
    where: { id: 'tournament-demo' },
    create: {
      id: 'tournament-demo',
      name: 'NForce Premier League 2026',
      ...demoDetails,
      ...demoWindow,
      status: 'published',
      organizerId: organizer.id,
    },
    update: { status: 'published', ...demoDetails, ...demoWindow },
  });
  const demoBracketWindow = {
    registrationStartDate: daysFromNow(-40),
    registrationEndDate: daysFromNow(-15),
  };
  await prisma.tournamentAgeGroup.upsert({
    where: { id: 'tag-tournament-demo' },
    create: {
      id: 'tag-tournament-demo',
      tournamentId: 'tournament-demo',
      ageGroupId: 'age-open',
      bornAfter: null,
      bornBefore: null,
      genderCategory: 'mixed',
      format: 'T20',
      entryFee: 5000,
      ...demoBracketWindow,
    },
    update: {
      ageGroupId: 'age-open',
      bornAfter: null,
      bornBefore: null,
      genderCategory: 'mixed',
      format: 'T20',
      entryFee: 5000,
      ...demoBracketWindow,
    },
  });
  await prisma.tournamentAgeGroup.upsert({
    where: { id: 'tag-tournament-demo-u19' },
    create: {
      id: 'tag-tournament-demo-u19',
      tournamentId: 'tournament-demo',
      ageGroupId: 'age-u19',
      bornAfter: null,
      bornBefore: null,
      genderCategory: 'mixed',
      format: 'T10',
      entryFee: 2500,
      ...demoBracketWindow,
    },
    update: {
      ageGroupId: 'age-u19',
      bornAfter: null,
      bornBefore: null,
      genderCategory: 'mixed',
      format: 'T10',
      entryFee: 2500,
      ...demoBracketWindow,
    },
  });

  const draftDetails = {
    description: 'A planning-stage tournament kept in draft — never leaks publicly.',
    structure: 'knockout' as const,
    teamSelectionMode: 'draft_based' as const,
    oversPerInnings: 50,
    rules: null,
    capacity: 8,
    prizePoolAmount: null,
    prizePoolDescription: null,
    notifyOnPublish: true,
  };
  const draftWindow = { startDate: daysFromNow(60), endDate: daysFromNow(75) };
  await prisma.tournament.upsert({
    where: { id: 'tournament-draft' },
    create: {
      id: 'tournament-draft',
      name: 'Winter Cup (planning)',
      ...draftDetails,
      ...draftWindow,
      status: 'draft',
      organizerId: organizer.id,
    },
    update: { status: 'draft', ...draftDetails, ...draftWindow },
  });
  const draftBracketWindow = {
    registrationStartDate: daysFromNow(-10),
    registrationEndDate: daysFromNow(50),
  };
  await prisma.tournamentAgeGroup.upsert({
    where: { id: 'tag-tournament-draft' },
    create: {
      id: 'tag-tournament-draft',
      tournamentId: 'tournament-draft',
      ageGroupId: 'age-u19',
      bornAfter: null,
      bornBefore: null,
      genderCategory: 'mixed',
      format: 'One Day',
      entryFee: null,
      ...draftBracketWindow,
    },
    update: {
      ageGroupId: 'age-u19',
      bornAfter: null,
      bornBefore: null,
      genderCategory: 'mixed',
      format: 'One Day',
      entryFee: null,
      ...draftBracketWindow,
    },
  });

  for (const def of [...teamDefs, ...extraTeamDefs]) {
    const existing = await prisma.registration.findFirst({
      where: { tournamentId: 'tournament-demo', teamId: def.id, status: 'active' },
    });
    if (!existing) {
      await prisma.registration.create({
        data: {
          tournamentId: 'tournament-demo',
          tournamentAgeGroupId: 'tag-tournament-demo',
          teamId: def.id,
          status: 'active',
        },
      });
    }
  }
  console.log('Seeded team registrations');

  for (const child of [child1, child2]) {
    const existing = await prisma.registration.findFirst({
      where: { tournamentId: 'tournament-demo', userId: child.id, status: 'active' },
    });
    if (!existing) {
      await prisma.registration.create({
        data: {
          tournamentId: 'tournament-demo',
          tournamentAgeGroupId: 'tag-tournament-demo',
          userId: child.id,
          status: 'active',
        },
      });
    }
  }
  console.log("Seeded demo children's registrations");

  await prisma.ground.upsert({
    where: { id: 'ground-demo' },
    create: {
      id: 'ground-demo',
      name: 'Deccan Cricket Stadium',
      location: 'Hyderabad',
      capacity: 5000,
      facilities: ['floodlights', 'pavilion', 'practice nets'],
      availabilityRules: [{ days: 'all', from: '06:00', to: '22:00' }],
      ownerId: groundOwner.id,
    },
    update: { name: 'Deccan Cricket Stadium' },
  });
  await prisma.ground.upsert({
    where: { id: 'ground-demo-2' },
    create: {
      id: 'ground-demo-2',
      name: 'Yuva Bharat Cricket Ground',
      location: 'Pune',
      capacity: 2000,
      facilities: ['nets'],
      availabilityRules: [{ days: 'all', from: '06:00', to: '20:00' }],
      ownerId: groundOwner.id,
    },
    update: { name: 'Yuva Bharat Cricket Ground' },
  });
  await prisma.ground.upsert({
    where: { id: 'ground-demo-3' },
    create: {
      id: 'ground-demo-3',
      name: 'Western Coast Cricket Arena',
      location: 'Mumbai',
      capacity: 3500,
      facilities: ['floodlights', 'pavilion'],
      availabilityRules: [{ days: 'all', from: '06:00', to: '22:00' }],
      ownerId: groundOwner.id,
    },
    update: { name: 'Western Coast Cricket Arena' },
  });

  const DURATION_MIN = 8 * 60;
  const fixtureDefs = [
    { id: 'fixture-1', home: 'team-falcons', away: 'team-tigers', day: -10 },
    { id: 'fixture-2', home: 'team-panthers', away: 'team-eagles', day: -7 },
    { id: 'fixture-3', home: 'team-falcons', away: 'team-panthers', day: -3 },
    { id: 'fixture-4', home: 'team-tigers', away: 'team-eagles', day: 4 },
    { id: 'fixture-5', home: 'team-falcons', away: 'team-eagles', day: 8 },
    { id: 'fixture-6', home: 'team-tigers', away: 'team-panthers', day: 12 },
  ];
  await prisma.groundBooking.deleteMany({
    where: { id: { in: fixtureDefs.map((f) => `booking-${f.id}`) } },
  });
  for (const f of fixtureDefs) {
    const startsAt = daysFromNow(f.day);
    const umpireStatus = f.day < 0 ? 'accepted' : f.id === 'fixture-4' ? 'invited' : 'applied';

    await prisma.fixture.upsert({
      where: { id: f.id },
      create: {
        id: f.id,
        tournamentId: 'tournament-demo',
        homeTeamId: f.home,
        awayTeamId: f.away,
        groundId: 'ground-demo',
        startsAt,
        durationMinutes: DURATION_MIN,
      },
      update: { groundId: 'ground-demo', startsAt, durationMinutes: DURATION_MIN },
    });
    const booking = {
      groundId: 'ground-demo',
      requesterId: organizer.id,
      fixtureId: f.id,
      startsAt,
      endsAt: addMinutes(startsAt, DURATION_MIN),
      status: 'confirmed' as const,
    };
    await prisma.groundBooking.create({ data: { id: `booking-${f.id}`, ...booking } });
    await prisma.umpireAssignment.upsert({
      where: { fixtureId_umpireId: { fixtureId: f.id, umpireId: umpire.id } },
      create: { fixtureId: f.id, umpireId: umpire.id, status: umpireStatus },
      update: { status: umpireStatus },
    });
  }
  console.log(`Seeded ${fixtureDefs.length} fixtures with bookings + umpire assignments`);

  const resultDefs = [
    {
      fixtureId: 'fixture-1',
      homeScore: '182/6 (20 ov)',
      awayScore: '164/9 (20 ov)',
      winnerTeamId: 'team-falcons',
    },
    {
      fixtureId: 'fixture-2',
      homeScore: '150/8 (20 ov)',
      awayScore: '131 all out (18.4 ov)',
      winnerTeamId: 'team-panthers',
    },
    {
      fixtureId: 'fixture-3',
      homeScore: '171/4 (20 ov)',
      awayScore: '170/7 (20 ov)',
      winnerTeamId: 'team-falcons',
    },
  ];
  for (const r of resultDefs) {
    await prisma.result.upsert({
      where: { fixtureId: r.fixtureId },
      create: { ...r, enteredById: organizer.id },
      update: { ...r, enteredById: organizer.id },
    });
  }

  const results = await prisma.result.findMany({
    where: { fixture: { tournamentId: 'tournament-demo' } },
    include: { fixture: true },
  });
  const table = new Map<
    string,
    { played: number; won: number; lost: number; drawn: number; points: number }
  >();
  for (const def of [...teamDefs, ...extraTeamDefs]) {
    table.set(def.id, { played: 0, won: 0, lost: 0, drawn: 0, points: 0 });
  }
  for (const r of results) {
    for (const teamId of [r.fixture.homeTeamId, r.fixture.awayTeamId]) {
      const row = table.get(teamId);
      if (!row) continue;
      row.played += 1;
      if (r.winnerTeamId === null) {
        row.drawn += 1;
        row.points += 1;
      } else if (r.winnerTeamId === teamId) {
        row.won += 1;
        row.points += 2;
      } else {
        row.lost += 1;
      }
    }
  }
  await prisma.standing.deleteMany({ where: { tournamentId: 'tournament-demo' } });
  await prisma.standing.createMany({
    data: [...table.entries()].map(([teamId, row]) => ({
      tournamentId: 'tournament-demo',
      teamId,
      ...row,
    })),
  });
  console.log('Rebuilt standings from results');

  console.log('\nSeed complete.');
  console.log(`  Admin:         admin@${DEMO_EMAIL_DOMAIN} / $SEED_ADMIN_PASSWORD`);
  console.log(
    `  Demo accounts: {organizer,player,manager,groundowner,umpire,parent}@${DEMO_EMAIL_DOMAIN}`,
  );
  console.log(`  Demo password: ${DEMO_PASSWORD}`);
  console.log(
    `  Demo parent (parent@${DEMO_EMAIL_DOMAIN}) manages 2 children, both registered for tournament-demo`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
