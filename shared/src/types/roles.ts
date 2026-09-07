export const ROLE_NAMES = [
  'platform_admin',
  'organizer',
  'player',
  'team_manager',
  'ground_owner',
  'umpire',
  'parent',
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const ROLE_LABELS: Record<RoleName, string> = {
  platform_admin: 'Platform Admin',
  organizer: 'Tournament Organizer',
  player: 'Player',
  team_manager: 'Team Manager',
  ground_owner: 'Ground Owner',
  umpire: 'Umpire',
  parent: 'Parent',
};

export const CLUB_ID_PREFIXES: Partial<Record<RoleName, string>> = {
  organizer: 'O',
  ground_owner: 'G',
  umpire: 'U',
  team_manager: 'T',
  parent: 'PT',
  player: 'P',
};

export const CLUB_ID_ROLE_PRIORITY: RoleName[] = [
  'organizer',
  'ground_owner',
  'umpire',
  'team_manager',
  'parent',
  'player',
];
