import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { SurfaceTypeService } from '../../src/modules/surfaceTypes/surfaceType.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import { FakeAudit, FakeSurfaceTypeRepo, FakeUserRepo } from '../helpers/fakes';

describe('SurfaceTypeService', () => {
  let surfaceTypes: FakeSurfaceTypeRepo;
  let audit: FakeAudit;
  let service: SurfaceTypeService;
  let organizerId: string;
  let otherOrganizerId: string;
  let playerId: string;

  beforeEach(async () => {
    surfaceTypes = new FakeSurfaceTypeRepo();
    audit = new FakeAudit();
    const users = new FakeUserRepo();
    service = new SurfaceTypeService({ surfaceTypes, authz: new AuthzService(users), audit });

    const mk = async (email: string, roleIds: number[]) =>
      (await users.create({ name: email, email, passwordHash: await hash('x'), roleIds })).id;
    organizerId = await mk('organizer@example.com', [2]);
    otherOrganizerId = await mk('other-organizer@example.com', [2]);
    playerId = await mk('player@example.com', [3]);

    surfaceTypes.rows.set('surface-turf', {
      id: 'surface-turf',
      name: 'Turf',
      organizerId: null,
      createdAt: new Date(),
    });
  });

  it('anyone can list, seeing platform defaults plus only their own additions', async () => {
    await service.create(organizerId, { name: 'Astro Mine' });
    await service.create(otherOrganizerId, { name: 'Astro Theirs' });

    const mine = await service.list(organizerId);
    expect(mine.map((s) => s.name).sort()).toEqual(['Astro Mine', 'Turf']);

    const theirs = await service.list(otherOrganizerId);
    expect(theirs.map((s) => s.name).sort()).toEqual(['Astro Theirs', 'Turf']);

    const playerView = await service.list(playerId);
    expect(playerView.map((s) => s.name)).toEqual(['Turf']);
  });

  it('rejects create from a non-organizer', async () => {
    await expect(service.create(playerId, { name: 'Matting' })).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
  });

  it('creates, owned by the creating organizer, and audits, rejecting a duplicate name', async () => {
    const created = await service.create(organizerId, { name: 'Cement' });
    expect(created.name).toBe('Cement');
    expect(created.organizerId).toBe(organizerId);
    expect(audit.actionsOf('surface_type.created')).toHaveLength(1);

    await expect(service.create(otherOrganizerId, { name: 'Cement' })).rejects.toMatchObject({
      code: 'SURFACE_TYPE_EXISTS',
    });
  });

  it('lets an organizer permanently delete their own surface type, and audits it', async () => {
    const created = await service.create(organizerId, { name: 'Matting' });
    await service.delete(organizerId, created.id);
    expect(audit.actionsOf('surface_type.deleted')).toHaveLength(1);
    expect((await service.list(organizerId)).map((s) => s.name)).not.toContain('Matting');
  });

  it("rejects deleting a platform default or another organizer's own surface type", async () => {
    await expect(service.delete(organizerId, 'surface-turf')).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });

    const theirs = await service.create(otherOrganizerId, { name: 'Their Surface' });
    await expect(service.delete(organizerId, theirs.id)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
  });

  it('rejects deleting a surface type currently used by a tournament', async () => {
    const created = await service.create(organizerId, { name: 'Clay' });
    surfaceTypes.referencedByTournament.add(created.id);
    await expect(service.delete(organizerId, created.id)).rejects.toMatchObject({
      code: 'SURFACE_TYPE_IN_USE',
    });
    expect((await service.list(organizerId)).map((s) => s.name)).toContain('Clay');
  });
});
