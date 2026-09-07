import { describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../../src/lib/errors';
import { tokenService } from '../../src/modules/users-auth/token.service';

describe('tokenService', () => {
  it('signs and verifies an access token round-trip', async () => {
    const jwt = await tokenService.signAccessToken('user-42', 15);
    const { userId, issuedAt } = await tokenService.verifyAccessToken(jwt);
    expect(userId).toBe('user-42');
    expect(Math.abs(issuedAt.getTime() - Date.now())).toBeLessThan(5_000);
  });

  it('rejects a tampered token', async () => {
    const jwt = await tokenService.signAccessToken('user-42', 15);
    const tampered = jwt.slice(0, -4) + 'AAAA';
    await expect(tokenService.verifyAccessToken(tampered)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('rejects garbage', async () => {
    await expect(tokenService.verifyAccessToken('not-a-jwt')).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('opaque tokens: hash is deterministic sha256, raw values are unique', () => {
    const a = tokenService.generateOpaqueToken();
    const b = tokenService.generateOpaqueToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).toBe(tokenService.hashToken(a.raw));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
