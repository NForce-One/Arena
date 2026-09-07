import type { RoleName } from '@nforce/shared';
import { ForbiddenError } from '../../lib/errors';
import type { UserRepoPort } from './user.repo';

export class AuthzService {
  constructor(private readonly users: Pick<UserRepoPort, 'getRoleNames'>) {}

  getRoles(userId: string): Promise<RoleName[]> {
    return this.users.getRoleNames(userId);
  }

  async assertRole(userId: string, ...allowed: RoleName[]): Promise<RoleName[]> {
    const roles = await this.users.getRoleNames(userId);
    if (!roles.some((r) => allowed.includes(r))) {
      throw new ForbiddenError('You are not allowed to perform this action', 'NOT_ALLOWED');
    }
    return roles;
  }
}
