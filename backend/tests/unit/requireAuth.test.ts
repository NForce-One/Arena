import { hash } from '@node-rs/argon2';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeRequireAuth } from '../../src/middleware/requireAuth';
import { tokenService } from '../../src/modules/users-auth/token.service';
import { FakeUserRepo } from '../helpers/fakes';

function fakeReq(authorization?: string): Request {
  return { headers: authorization ? { authorization } : {} } as Request;
}

async function run(middleware: ReturnType<typeof makeRequireAuth>, req: Request) {
  await middleware(req, {} as Response, () => {});
  return req;
}

describe('requireAuth middleware', () => {
  let users: FakeUserRepo;
  let middleware: ReturnType<typeof makeRequireAuth>;
  let userId: string;

  beforeEach(async () => {
    users = new FakeUserRepo();
    middleware = makeRequireAuth(users, tokenService);
    userId = (
      await users.create({
        name: 'Pat',
        email: 'pat@example.com',
        passwordHash: await hash('x'),
        roleIds: [3],
      })
    ).id;
  });

  it('accepts a valid Bearer token and attaches req.auth', async () => {
    const jwt = await tokenService.signAccessToken(userId, 15);
    const req = await run(middleware, fakeReq(`Bearer ${jwt}`));
    expect(req.auth).toEqual({ userId });
  });

  it('rejects a missing Authorization header', async () => {
    await expect(run(middleware, fakeReq())).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a garbage token', async () => {
    await expect(run(middleware, fakeReq('Bearer garbage'))).rejects.toMatchObject({
      status: 401,
    });
  });

  it('rejects a token for a user that no longer exists', async () => {
    const jwt = await tokenService.signAccessToken('deleted-user', 15);
    await expect(run(middleware, fakeReq(`Bearer ${jwt}`))).rejects.toMatchObject({ status: 401 });
  });

  it('rejects a token issued BEFORE the password changed (reset kills live sessions)', async () => {
    const jwt = await tokenService.signAccessToken(userId, 15);
    await new Promise((r) => setTimeout(r, 1100));
    await users.updatePassword(userId, await hash('new'));
    await expect(run(middleware, fakeReq(`Bearer ${jwt}`))).rejects.toMatchObject({
      code: 'TOKEN_SUPERSEDED',
    });
  });
});
