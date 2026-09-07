import { Prisma } from '@prisma/client';
import { CLUB_ID_PREFIXES, CLUB_ID_ROLE_PRIORITY, type RoleName } from '@nforce/shared';
import type { DbClient } from '../../lib/db';
import { ConflictError } from '../../lib/errors';
import type { UserRepoPort } from './user.repo';

function randomClubNumber(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function prefixFor(roles: RoleName[]): string | null {
  const role = CLUB_ID_ROLE_PRIORITY.find((r) => roles.includes(r));
  return role ? (CLUB_ID_PREFIXES[role] ?? null) : null;
}

export async function syncClubId(
  users: UserRepoPort,
  userId: string,
  db?: DbClient,
): Promise<string | null> {
  const [user, roles] = await Promise.all([
    users.findById(userId, db),
    users.getRoleNames(userId, db),
  ]);
  if (!user) return null;

  const desiredPrefix = prefixFor(roles);
  if (!desiredPrefix) {
    if (user.clubId) await users.setClubId(userId, null, db);
    return null;
  }

  const [currentPrefix, currentNumber] = user.clubId ? user.clubId.split('-') : [null, null];
  if (currentPrefix === desiredPrefix) return user.clubId;

  let number = currentNumber ?? randomClubNumber();
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `${desiredPrefix}-${number}`;
    try {
      await users.setClubId(userId, candidate, db);
      return candidate;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        number = randomClubNumber();
        continue;
      }
      throw err;
    }
  }
  throw new ConflictError('Could not assign a club id. Please try again.', 'CLUB_ID_CONFLICT');
}
