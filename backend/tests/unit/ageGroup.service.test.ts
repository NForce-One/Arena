import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { AgeGroupService } from '../../src/modules/ageGroups/ageGroup.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import { FakeAgeGroupRepo, FakeAudit, FakeUserRepo } from '../helpers/fakes';

describe('AgeGroupService', () => {
  let ageGroups: FakeAgeGroupRepo;
  let audit: FakeAudit;
  let service: AgeGroupService;
  let organizerId: string;
  let otherOrganizerId: string;
  let playerId: string;

  beforeEach(async () => {
    ageGroups = new FakeAgeGroupRepo();
    audit = new FakeAudit();
    const users = new FakeUserRepo();
    service = new AgeGroupService({ ageGroups, authz: new AuthzService(users), audit });

    const mk = async (email: string, roleIds: number[]) =>
      (await users.create({ name: email, email, passwordHash: await hash('x'), roleIds })).id;
    organizerId = await mk('organizer@example.com', [2]);
    otherOrganizerId = await mk('other-organizer@example.com', [2]);
    playerId = await mk('player@example.com', [3]);

    ageGroups.rows.set('age-open', {
      id: 'age-open',
      name: 'Open',
      minAge: null,
      maxAge: null,
      organizerId: null,
      hidden: false,
    });
  });

  it('anyone can list, seeing platform defaults plus only their own additions', async () => {
    await service.create(organizerId, { name: 'U-15 Mine' });
    await service.create(otherOrganizerId, { name: 'U-15 Theirs' });

    const mine = await service.list(organizerId);
    expect(mine.map((g) => g.name).sort()).toEqual(['Open', 'U-15 Mine']);

    const theirs = await service.list(otherOrganizerId);
    expect(theirs.map((g) => g.name).sort()).toEqual(['Open', 'U-15 Theirs']);

    const playerView = await service.list(playerId);
    expect(playerView.map((g) => g.name)).toEqual(['Open']);
  });

  it('rejects create from a non-organizer', async () => {
    await expect(service.create(playerId, { name: 'U-15' })).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
  });

  it('creates, owned by the creating organizer, and audits, rejecting a duplicate name', async () => {
    const created = await service.create(organizerId, { name: 'U-19' });
    expect(created.name).toBe('U-19');
    expect(created.organizerId).toBe(organizerId);
    expect(audit.actionsOf('age_group.created')).toHaveLength(1);

    await expect(service.create(otherOrganizerId, { name: 'U-19' })).rejects.toMatchObject({
      code: 'AGE_GROUP_EXISTS',
    });
  });

  it('lets an organizer hide (and unhide) their own age group, and audits both', async () => {
    const created = await service.create(organizerId, { name: 'U-13' });
    const hidden = await service.setHidden(organizerId, created.id, true);
    expect(hidden.name).toBe('U-13');
    expect(audit.actionsOf('age_group.hidden')).toHaveLength(1);
    expect((await service.list(organizerId)).map((g) => g.name)).not.toContain('U-13');

    await service.setHidden(organizerId, created.id, false);
    expect(audit.actionsOf('age_group.unhidden')).toHaveLength(1);
    expect((await service.list(organizerId)).map((g) => g.name)).toContain('U-13');
  });

  it("rejects hiding a platform default or another organizer's own age group", async () => {
    await expect(service.setHidden(organizerId, 'age-open', true)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });

    const theirs = await service.create(otherOrganizerId, { name: 'Their Bracket' });
    await expect(service.setHidden(organizerId, theirs.id, true)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
  });
});
