import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { ParentService } from '../../src/modules/parents/parent.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import { UsersService } from '../../src/modules/users-auth/users.service';
import {
  FakeAdminVerificationSender,
  FakeAudit,
  FakeFixtureRepo,
  FakeNotificationRepo,
  FakeResultRepo,
  FakeStorageAdapter,
  FakeTeamRepo,
  FakeUserRepo,
  MailboxAdapter,
  fakeTx,
} from '../helpers/fakes';

async function seedUser(users: FakeUserRepo, email: string, roleIds: number[]) {
  return users.create({
    name: email.split('@')[0]!,
    email,
    passwordHash: await hash('x'),
    roleIds,
  });
}

function dobWithEighteenthIn(daysFromNow: number): string {
  const eighteenth = new Date(Date.now() + daysFromNow * 86_400_000);
  const dob = new Date(
    Date.UTC(eighteenth.getUTCFullYear() - 18, eighteenth.getUTCMonth(), eighteenth.getUTCDate()),
  );
  return dob.toISOString().slice(0, 10);
}

describe('ParentService', () => {
  let users: FakeUserRepo;
  let audit: FakeAudit;
  let usersService: UsersService;
  let teamRepo: FakeTeamRepo;
  let fixtureRepo: FakeFixtureRepo;
  let resultRepo: FakeResultRepo;
  let service: ParentService;
  let parentId: string;
  let otherParentId: string;

  beforeEach(async () => {
    users = new FakeUserRepo();
    audit = new FakeAudit();
    const authz = new AuthzService(users);
    const notifications = new NotificationService({
      notifications: new FakeNotificationRepo(),
      users,
      email: new MailboxAdapter(),
    });
    usersService = new UsersService({
      users,
      authz,
      audit,
      tx: fakeTx,
      auth: new FakeAdminVerificationSender(),
      storage: new FakeStorageAdapter(),
      notifications,
    });
    teamRepo = new FakeTeamRepo(users);
    fixtureRepo = new FakeFixtureRepo();
    resultRepo = new FakeResultRepo(users);
    service = new ParentService({
      users,
      usersService,
      authz,
      audit,
      tx: fakeTx,
      teams: teamRepo,
      fixtures: fixtureRepo,
      results: resultRepo,
    });

    parentId = (await seedUser(users, 'parent@example.com', [7])).id;
    otherParentId = (await seedUser(users, 'other-parent@example.com', [7])).id;
  });

  it('addChild creates a managed player with no login of their own', async () => {
    const child = await service.addChild(parentId, { name: 'Kid One', dateOfBirth: '2015-06-01' });
    expect(child.name).toBe('Kid One');
    expect(child.isMinor).toBe(true);
    expect(child.approachingAdulthood).toBe(false);

    const row = await users.findById(child.id);
    expect(row?.managedByParentId).toBe(parentId);
    expect(row?.email).toMatch(/^managed-.+@no-login\.nforcearena\.internal$/);
    expect(row?.passwordHash).toMatch(/^\$argon2/);
    expect(await users.getRoleNames(child.id)).toContain('player');
    expect(audit.entries.some((e) => e.action === 'child.added' && e.entityId === child.id)).toBe(
      true,
    );
  });

  it("rejects a child DOB on or before the parent's own DOB", async () => {
    await users.updateProfile(parentId, {
      name: 'Parent',
      dateOfBirth: new Date('2008-01-01'),
      academyName: null,
      state: null,
    });
    await expect(
      service.addChild(parentId, { name: 'Kid', dateOfBirth: '1972-01-01' }),
    ).rejects.toMatchObject({ code: 'CHILD_DOB_BEFORE_PARENT' });
    await expect(
      service.addChild(parentId, { name: 'Kid', dateOfBirth: '2008-01-01' }),
    ).rejects.toMatchObject({ code: 'CHILD_DOB_BEFORE_PARENT' });
  });

  it('blocks adding (or renaming into) a duplicate child — same name + DOB under the same parent', async () => {
    await service.addChild(parentId, { name: 'Kid One', dateOfBirth: '2015-06-01' });
    await expect(
      service.addChild(parentId, { name: '  kid one  ', dateOfBirth: '2015-06-01' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_CHILD_PROFILE' });
    const differentDob = await service.addChild(parentId, {
      name: 'Kid One',
      dateOfBirth: '2016-01-01',
    });
    expect(differentDob.name).toBe('Kid One');
    const theirs = await service.addChild(otherParentId, {
      name: 'Kid One',
      dateOfBirth: '2015-06-01',
    });
    expect(theirs.name).toBe('Kid One');

    const second = await service.addChild(parentId, { name: 'Kid Two', dateOfBirth: '2017-01-01' });
    await expect(
      service.updateChild(parentId, second.id, { name: 'Kid One', dateOfBirth: '2015-06-01' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_CHILD_PROFILE' });
  });

  it('allows a child DOB when the parent has no dateOfBirth of their own on record', async () => {
    const child = await service.addChild(parentId, { name: 'Kid', dateOfBirth: '1972-01-01' });
    expect(child.name).toBe('Kid');
  });

  it("updateChild also rejects moving a child's DOB to on/before the parent's own DOB", async () => {
    await users.updateProfile(parentId, {
      name: 'Parent',
      dateOfBirth: new Date('2008-01-01'),
      academyName: null,
      state: null,
    });
    const child = await service.addChild(parentId, { name: 'Kid', dateOfBirth: '2015-01-01' });
    await expect(
      service.updateChild(parentId, child.id, { name: 'Kid', dateOfBirth: '1972-01-01' }),
    ).rejects.toMatchObject({ code: 'CHILD_DOB_BEFORE_PARENT' });
  });

  it('rejects addChild from a non-parent', async () => {
    const playerId = (await seedUser(users, 'plain-player@example.com', [3])).id;
    await expect(
      service.addChild(playerId, { name: 'X', dateOfBirth: '2015-01-01' }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('listChildren flags approachingAdulthood within 180 days of 18, and isMinor false once past it', async () => {
    const almostAdult = await service.addChild(parentId, {
      name: 'Almost Adult',
      dateOfBirth: dobWithEighteenthIn(100),
    });
    const adult = await service.addChild(parentId, {
      name: 'Just Turned Adult',
      dateOfBirth: dobWithEighteenthIn(-1),
    });
    const notYetClose = await service.addChild(parentId, {
      name: 'Not Yet Close',
      dateOfBirth: dobWithEighteenthIn(3 * 365),
    });

    const list = await service.listChildren(parentId);
    const byId = new Map(list.map((c) => [c.id, c]));

    expect(byId.get(almostAdult.id)?.isMinor).toBe(true);
    expect(byId.get(almostAdult.id)?.approachingAdulthood).toBe(true);

    expect(byId.get(adult.id)?.isMinor).toBe(false);
    expect(byId.get(adult.id)?.approachingAdulthood).toBe(false);

    expect(byId.get(notYetClose.id)?.isMinor).toBe(true);
    expect(byId.get(notYetClose.id)?.approachingAdulthood).toBe(false);
  });

  it('approachingAdulthood clears once a claim invite has already been sent', async () => {
    const child = await service.addChild(parentId, {
      name: 'Almost Adult',
      dateOfBirth: dobWithEighteenthIn(30),
    });
    let [dto] = await service.listChildren(parentId);
    expect(dto?.approachingAdulthood).toBe(true);

    await users.setClaimInviteSentAt(child.id, {
      at: new Date(),
      pendingClaimEmail: 'real@example.com',
    });
    [dto] = await service.listChildren(parentId);
    expect(dto?.approachingAdulthood).toBe(false);
  });

  it("listChildren only returns the calling parent's own children", async () => {
    await service.addChild(parentId, { name: 'Mine', dateOfBirth: '2015-01-01' });
    await service.addChild(otherParentId, { name: 'Not mine', dateOfBirth: '2015-01-01' });

    const mine = await service.listChildren(parentId);
    expect(mine.map((c) => c.name)).toEqual(['Mine']);
  });

  it('updateChild rejects a parent who does not own the child', async () => {
    const child = await service.addChild(parentId, { name: 'Kid', dateOfBirth: '2015-01-01' });
    await expect(
      service.updateChild(otherParentId, child.id, { name: 'Hijacked', dateOfBirth: '2015-01-01' }),
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('updateChild rejects once the child is no longer a minor', async () => {
    const child = await service.addChild(parentId, {
      name: 'Adult Now',
      dateOfBirth: dobWithEighteenthIn(-365),
    });
    await expect(
      service.updateChild(parentId, child.id, { name: 'New Name', dateOfBirth: '2007-01-01' }),
    ).rejects.toMatchObject({ code: 'CHILD_NO_LONGER_MINOR' });
  });

  it('updateChild succeeds for the owning parent while the child is still a minor', async () => {
    const child = await service.addChild(parentId, { name: 'Kid', dateOfBirth: '2015-01-01' });
    const updated = await service.updateChild(parentId, child.id, {
      name: 'Renamed Kid',
      dateOfBirth: '2015-06-15',
    });
    expect(updated.name).toBe('Renamed Kid');
    expect(audit.entries.some((e) => e.action === 'child.updated' && e.entityId === child.id)).toBe(
      true,
    );
  });

  it('uploads and deletes a child photo through the reused UsersService logic', async () => {
    const child = await service.addChild(parentId, { name: 'Kid', dateOfBirth: '2015-01-01' });
    const tinyPngBase64 = Buffer.from('fake-image-bytes').toString('base64');

    const withPhoto = await service.uploadChildPhoto(parentId, child.id, {
      data: tinyPngBase64,
      contentType: 'image/png',
    });
    expect(withPhoto.photoUrl).toContain('files.test');

    const cleared = await service.deleteChildPhoto(parentId, child.id);
    expect(cleared.photoUrl).toBeNull();
    expect(
      audit.entries.some(
        (e) =>
          e.action === 'child.updated' &&
          e.entityId === child.id &&
          (e.meta as { field?: string })?.field === 'photo',
      ),
    ).toBe(true);
  });

  describe('updateChildSportsProfile', () => {
    const sportsInput = {
      phone: '5550000',
      school: 'Kid Elementary',
      jerseyNumber: 4,
      jerseyName: 'FLASH',
      jerseySize: 's' as const,
      battingStyle: 'left_handed' as const,
      battingStyleOther: null,
      bowlingStyle: 'none' as const,
      bowlingStyleOther: null,
      playingRole: 'batsman' as const,
      emergencyContactName: 'Guardian',
      emergencyContactPhone: '555-1111',
      gender: 'male' as const,
      consentAccepted: true as const,
    };

    it('lets the owning parent fill in the cricket profile and sign consent, audited as child.updated', async () => {
      const child = await service.addChild(parentId, { name: 'Kid', dateOfBirth: '2015-01-01' });
      const profile = await service.updateChildSportsProfile(
        parentId,
        child.id,
        sportsInput,
        '1.2.3.4',
      );
      expect(profile).toMatchObject({
        school: 'Kid Elementary',
        jerseyNumber: 4,
        consentConfirmed: true,
      });

      const row = await users.findById(child.id);
      expect(row?.consentedByUserId).toBe(parentId);

      const entries = audit.entries.filter(
        (e) => e.action === 'child.updated' && e.entityId === child.id,
      );
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ actorUserId: parentId, ip: '1.2.3.4' });
    });

    it('rejects a parent who does not own the child', async () => {
      const child = await service.addChild(parentId, { name: 'Kid', dateOfBirth: '2015-01-01' });
      await expect(
        service.updateChildSportsProfile(otherParentId, child.id, sportsInput),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    });

    it('rejects once the child is no longer a minor', async () => {
      const child = await service.addChild(parentId, {
        name: 'Adult Now',
        dateOfBirth: dobWithEighteenthIn(-365),
      });
      await expect(
        service.updateChildSportsProfile(parentId, child.id, sportsInput),
      ).rejects.toMatchObject({ code: 'CHILD_NO_LONGER_MINOR' });
    });

    it('getChildSportsProfile lets the parent read the profile even past the 18-year cutoff', async () => {
      const child = await service.addChild(parentId, {
        name: 'Adult Now',
        dateOfBirth: dobWithEighteenthIn(-365),
      });
      await expect(service.getChildSportsProfile(parentId, child.id)).resolves.toMatchObject({
        id: child.id,
      });
    });
  });

  describe('listChildrenApproachingAdulthood', () => {
    let adminId: string;

    beforeEach(async () => {
      adminId = (await seedUser(users, 'admin@example.com', [1])).id;
    });

    it('rejects a non-admin caller, including the child’s own parent', async () => {
      await expect(service.listChildrenApproachingAdulthood(parentId)).rejects.toMatchObject({
        code: 'NOT_ALLOWED',
      });
    });

    it('spans every family (unlike listChildren, which is scoped to one parent)', async () => {
      const mine = await service.addChild(parentId, {
        name: 'Almost Adult',
        dateOfBirth: dobWithEighteenthIn(30),
      });
      const theirs = await service.addChild(otherParentId, {
        name: 'Other Almost Adult',
        dateOfBirth: dobWithEighteenthIn(30),
      });

      const list = await service.listChildrenApproachingAdulthood(adminId);
      const ids = list.map((c) => c.id);
      expect(ids).toContain(mine.id);
      expect(ids).toContain(theirs.id);
    });

    it('includes an already-18 child but excludes one far from the window, and carries parent identity', async () => {
      const almostAdult = await service.addChild(parentId, {
        name: 'Almost Adult',
        dateOfBirth: dobWithEighteenthIn(30),
      });
      const alreadyAdult = await service.addChild(parentId, {
        name: 'Already Adult',
        dateOfBirth: dobWithEighteenthIn(-365),
      });
      const notYetClose = await service.addChild(parentId, {
        name: 'Not Yet Close',
        dateOfBirth: dobWithEighteenthIn(3 * 365),
      });

      const list = await service.listChildrenApproachingAdulthood(adminId);
      const byId = new Map(list.map((c) => [c.id, c]));

      expect(byId.has(almostAdult.id)).toBe(true);
      expect(byId.get(almostAdult.id)).toMatchObject({
        parentId,
        parentEmail: 'parent@example.com',
      });
      expect(byId.has(alreadyAdult.id)).toBe(true);
      expect(byId.has(notYetClose.id)).toBe(false);
    });

    it('still includes a child an invite was already sent to — admin needs to see pending, not just new, candidates', async () => {
      const child = await service.addChild(parentId, {
        name: 'Almost Adult',
        dateOfBirth: dobWithEighteenthIn(30),
      });
      await users.setClaimInviteSentAt(child.id, {
        at: new Date(),
        pendingClaimEmail: 'real@example.com',
      });

      const list = await service.listChildrenApproachingAdulthood(adminId);
      const dto = list.find((c) => c.id === child.id);
      expect(dto).toBeDefined();
      expect(dto?.approachingAdulthood).toBe(false);
      expect(dto?.claimInviteSentAt).not.toBeNull();
    });
  });

  describe('childFixtures', () => {
    it("lists fixtures for every team the child is an accepted roster member of, from the child's own team perspective", async () => {
      const child = await service.addChild(parentId, {
        name: 'Kid',
        dateOfBirth: '2015-06-01',
      });
      const team = await teamRepo.create(otherParentId, 'Falcons');
      await teamRepo.addAcceptedRosterEntry(team.id, child.id, 'player');
      fixtureRepo.tournaments.set('t1', { name: 'Cup', status: 'published' });
      fixtureRepo.teamNames.set(team.id, 'Falcons');
      fixtureRepo.teamNames.set('team-opponent', 'Eagles');
      const fixture = await fixtureRepo.create({
        tournamentId: 't1',
        homeTeamId: team.id,
        awayTeamId: 'team-opponent',
        groundId: null,
        startsAt: new Date('2026-09-10T09:00:00.000Z'),
        durationMinutes: 180,
      });

      const entries = await service.childFixtures(parentId, child.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        tournamentName: 'Cup',
        perspective: 'Falcons',
        fixture: {
          id: fixture.id,
          homeTeam: 'Falcons',
          awayTeam: 'Eagles',
          startsAt: '2026-09-10T09:00:00.000Z',
          result: null,
        },
      });
    });

    it('includes the result once played, naming the winner from the child’s own team perspective', async () => {
      const child = await service.addChild(parentId, {
        name: 'Kid',
        dateOfBirth: '2015-06-01',
      });
      const team = await teamRepo.create(otherParentId, 'Falcons');
      await teamRepo.addAcceptedRosterEntry(team.id, child.id, 'player');
      fixtureRepo.tournaments.set('t1', { name: 'Cup', status: 'published' });
      fixtureRepo.teamNames.set(team.id, 'Falcons');
      fixtureRepo.teamNames.set('team-opponent', 'Eagles');
      const fixture = await fixtureRepo.create({
        tournamentId: 't1',
        homeTeamId: team.id,
        awayTeamId: 'team-opponent',
        groundId: null,
        startsAt: new Date('2026-08-01T09:00:00.000Z'),
        durationMinutes: 180,
      });
      resultRepo.results.set(fixture.id, {
        fixtureId: fixture.id,
        homeScore: '150/6',
        awayScore: '140/8',
        winnerTeamId: team.id,
        enteredById: parentId,
        enteredByName: 'Olivia Organizer',
        enteredAt: new Date(),
        homeRunsTotal: null,
        awayRunsTotal: null,
        playerScores: [],
      });

      const entries = await service.childFixtures(parentId, child.id);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.fixture.result).toMatchObject({
        homeScore: '150/6',
        awayScore: '140/8',
        winnerTeam: 'Falcons',
      });
    });

    it('returns an empty list when the child is not on any team', async () => {
      const child = await service.addChild(parentId, {
        name: 'Kid',
        dateOfBirth: '2015-06-01',
      });
      expect(await service.childFixtures(parentId, child.id)).toEqual([]);
    });

    it('rejects a parent who does not manage this child', async () => {
      const child = await service.addChild(parentId, {
        name: 'Kid',
        dateOfBirth: '2015-06-01',
      });
      await expect(service.childFixtures(otherParentId, child.id)).rejects.toMatchObject({
        code: 'NOT_ALLOWED',
      });
    });
  });
});
