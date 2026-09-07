import { hash } from '@node-rs/argon2';
import { beforeEach, describe, expect, it } from 'vitest';
import { GroundService } from '../../src/modules/grounds/ground.service';
import { AuthzService } from '../../src/modules/users-auth/authz.service';
import { FakeAudit, FakeGroundRepo, FakeUserRepo, fakeTx } from '../helpers/fakes';

describe('GroundService', () => {
  let users: FakeUserRepo;
  let grounds: FakeGroundRepo;
  let audit: FakeAudit;
  let service: GroundService;
  let ownerId: string;
  let unverifiedOwnerId: string;
  let otherOwnerId: string;
  let playerId: string;

  const input = {
    name: 'Sunrise Ground',
    location: 'Hyderabad',
    capacity: 5000,
    facilities: ['floodlights'],
    availabilityRules: [{ days: 'all', from: '06:00', to: '22:00' }],
  };

  beforeEach(async () => {
    users = new FakeUserRepo();
    grounds = new FakeGroundRepo();
    audit = new FakeAudit();
    service = new GroundService({
      grounds,
      users,
      authz: new AuthzService(users),
      audit,
      tx: fakeTx,
    });

    const mk = async (email: string, roleIds: number[], verified = true) => {
      const u = await users.create({ name: email, email, passwordHash: await hash('x'), roleIds });
      if (verified) await users.setVerified(u.id);
      return u.id;
    };
    ownerId = await mk('owner@example.com', [5]);
    unverifiedOwnerId = await mk('unverified@example.com', [5], false);
    otherOwnerId = await mk('other@example.com', [5]);
    playerId = await mk('player@example.com', [3]);
  });

  it('only a ground owner can create a ground', async () => {
    await expect(service.create(playerId, input)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });

  it('requires a verified email to list a ground', async () => {
    await expect(service.create(unverifiedOwnerId, input)).rejects.toMatchObject({
      code: 'EMAIL_NOT_VERIFIED',
    });
  });

  it('creates a ground for a verified owner', async () => {
    const ground = await service.create(ownerId, input);
    expect(ground.name).toBe('Sunrise Ground');
    expect(await service.listMine(ownerId)).toHaveLength(1);
  });

  it('blocks a different owner from editing', async () => {
    const ground = await service.create(ownerId, input);
    await expect(service.update(otherOwnerId, ground.id, { name: 'Hijack' })).rejects.toMatchObject(
      {
        code: 'NOT_ALLOWED',
      },
    );
    const updated = await service.update(ownerId, ground.id, { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
  });

  it('audits an update with which fields changed, but not a no-op save', async () => {
    const ground = await service.create(ownerId, input);

    await service.update(ownerId, ground.id, { name: input.name });
    expect(audit.actionsOf('ground.updated')).toHaveLength(0);

    await service.update(ownerId, ground.id, { name: 'Renamed', capacity: 8000 });
    const entries = audit.actionsOf('ground.updated');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorUserId: ownerId,
      entityType: 'ground',
      entityId: ground.id,
      meta: {
        name: 'Renamed',
        previousName: 'Sunrise Ground',
        changedFields: ['name', 'capacity'],
      },
    });
  });

  it('deletes an unreferenced ground and audits it', async () => {
    const ground = await service.create(ownerId, input);
    await service.delete(ownerId, ground.id, '1.2.3.4');
    expect(await service.listMine(ownerId)).toHaveLength(0);
    expect(audit.actionsOf('ground.deleted')).toHaveLength(1);
    expect(audit.actionsOf('ground.deleted')[0]).toMatchObject({
      actorUserId: ownerId,
      entityId: ground.id,
      meta: { name: 'Sunrise Ground' },
      ip: '1.2.3.4',
    });
  });

  it('blocks deleting a ground that still has a booking referencing it — the ground survives', async () => {
    const ground = await service.create(ownerId, input);
    grounds.bookings = { rows: new Map([['b1', { groundId: ground.id }]]) };
    await expect(service.delete(ownerId, ground.id)).rejects.toMatchObject({
      code: 'GROUND_IN_USE',
    });
    expect(await service.listMine(ownerId)).toHaveLength(1);
  });

  it('blocks deleting a ground that still has a fixture referencing it', async () => {
    const ground = await service.create(ownerId, input);
    grounds.fixtures = { fixtures: new Map([['f1', { groundId: ground.id }]]) };
    await expect(service.delete(ownerId, ground.id)).rejects.toMatchObject({
      code: 'GROUND_IN_USE',
    });
  });

  it('a different owner cannot delete someone else’s ground', async () => {
    const ground = await service.create(ownerId, input);
    await expect(service.delete(otherOwnerId, ground.id)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
    expect(await service.listMine(ownerId)).toHaveLength(1);
  });
});
