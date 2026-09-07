import { z } from 'zod';
import { ROLE_NAMES, type RoleName } from '../types/roles';

export const REQUESTABLE_ROLES = ROLE_NAMES.filter(
  (r): r is Exclude<RoleName, 'platform_admin' | 'player' | 'parent'> =>
    r !== 'platform_admin' && r !== 'player' && r !== 'parent',
);

export const requestedRoleSchema = z.enum(
  REQUESTABLE_ROLES as [
    (typeof REQUESTABLE_ROLES)[number],
    ...(typeof REQUESTABLE_ROLES)[number][],
  ],
);

export type RequestableRole = z.infer<typeof requestedRoleSchema>;

export const requestRoleSchema = z.object({
  role: requestedRoleSchema,
});
export type RequestRoleInput = z.infer<typeof requestRoleSchema>;
