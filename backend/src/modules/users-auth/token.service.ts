import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../lib/errors';

export interface TokenServicePort {
  signAccessToken(userId: string, ttlMinutes: number): Promise<string>;
  verifyAccessToken(token: string): Promise<{ userId: string; issuedAt: Date }>;
  generateOpaqueToken(): { raw: string; hash: string };
  hashToken(raw: string): string;
}

const secret = new TextEncoder().encode(env.JWT_SECRET);

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export const tokenService: TokenServicePort = {
  async signAccessToken(userId: string, ttlMinutes: number): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${ttlMinutes}m`)
      .sign(secret);
  },

  async verifyAccessToken(token: string): Promise<{ userId: string; issuedAt: Date }> {
    try {
      const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string' || typeof payload.iat !== 'number') {
        throw new Error('missing claims');
      }
      return { userId: payload.sub, issuedAt: new Date(payload.iat * 1000) };
    } catch {
      throw new UnauthorizedError('Invalid or expired access token', 'INVALID_TOKEN');
    }
  },

  generateOpaqueToken(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: hashToken(raw) };
  },

  hashToken,
};
