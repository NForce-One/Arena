import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../lib/errors';
import type { TokenServicePort } from '../modules/users-auth/token.service';
import type { UserRepoPort } from '../modules/users-auth/user.repo';

export function makeRequireAuth(
  users: Pick<UserRepoPort, 'findById'>,
  tokens: Pick<TokenServicePort, 'verifyAccessToken'>,
): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
    }

    const { userId, issuedAt } = await tokens.verifyAccessToken(header.slice('Bearer '.length));

    const user = await users.findById(userId);
    if (!user) {
      throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
    }
    if (user.passwordChangedAt && issuedAt < user.passwordChangedAt) {
      throw new UnauthorizedError('Session expired, please log in again', 'TOKEN_SUPERSEDED');
    }

    req.auth = { userId };
    next();
  };
}

export function makeOptionalAuth(
  users: Pick<UserRepoPort, 'findById'>,
  tokens: Pick<TokenServicePort, 'verifyAccessToken'>,
): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      next();
      return;
    }
    try {
      const { userId, issuedAt } = await tokens.verifyAccessToken(header.slice('Bearer '.length));
      const user = await users.findById(userId);
      if (user && !(user.passwordChangedAt && issuedAt < user.passwordChangedAt)) {
        req.auth = { userId };
      }
    } catch {
    }
    next();
  };
}
