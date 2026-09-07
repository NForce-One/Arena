import type { RoleName } from '@nforce/shared';

export const ROLE_RESTRICTED_ROUTES: { path: string; roles: RoleName[] }[] = [
  { path: '/admin/users', roles: ['platform_admin'] },
  { path: '/admin/announcements', roles: ['platform_admin'] },
  { path: '/admin/audit', roles: ['platform_admin'] },
  { path: '/admin/child-accounts', roles: ['platform_admin'] },
  { path: '/organizer/tournaments', roles: ['organizer', 'platform_admin'] },
  { path: '/organizer/bookings', roles: ['organizer', 'platform_admin'] },
  { path: '/teams', roles: ['team_manager', 'platform_admin'] },
  { path: '/tournaments/mine', roles: ['team_manager'] },
  { path: '/grounds', roles: ['ground_owner', 'platform_admin'] },
  { path: '/umpire', roles: ['umpire', 'platform_admin'] },
  { path: '/parent', roles: ['parent', 'platform_admin'] },
  { path: '/admin/contact-messages', roles: ['platform_admin'] },
];

function ruleFor(path: string) {
  return ROLE_RESTRICTED_ROUTES.find((r) => path === r.path || path.startsWith(`${r.path}/`));
}

export function rolesRequiredFor(path: string): RoleName[] | null {
  return ruleFor(path)?.roles ?? null;
}
