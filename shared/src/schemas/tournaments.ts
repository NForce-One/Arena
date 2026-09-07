import { z } from 'zod';
import { MAX_AGE_YEARS } from './dateOfBirth';

export function toTitleCase(value: string): string {
  return value.replace(/\S+/g, (word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase());
}

export function dateOnly(label: string, allowPast = false) {
  let schema = z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => !Number.isNaN(new Date(v).getTime()), `${label} must be a valid date`);
  if (!allowPast) {
    schema = schema.refine((v) => {
      const selectedDate = new Date(`${v}T00:00:00Z`);
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      return selectedDate >= today;
    }, `${label} cannot be in the past`);
  }
  return schema;
}

export const TOURNAMENT_STRUCTURES = ['round_robin', 'knockout', 'round_robin_knockout'] as const;
export const tournamentStructureSchema = z.enum(TOURNAMENT_STRUCTURES);
export type TournamentStructure = z.infer<typeof tournamentStructureSchema>;

export const TOURNAMENT_NOTIFY_AUDIENCES = [
  'everyone',
  'last_year_players',
  'last_year_managers',
  'state',
] as const;
export const tournamentNotifyAudienceSchema = z.enum(TOURNAMENT_NOTIFY_AUDIENCES);
export type TournamentNotifyAudience = z.infer<typeof tournamentNotifyAudienceSchema>;

export const TOURNAMENT_NOTIFY_AUDIENCE_LABELS: Record<TournamentNotifyAudience, string> = {
  everyone: 'Everyone (all players & team managers)',
  last_year_players: "Last year's players",
  last_year_managers: "Last year's team managers",
  state: 'Players & team managers in a specific state',
};

export const notifyAudiencesSchema = z
  .array(tournamentNotifyAudienceSchema)
  .refine((v) => new Set(v).size === v.length, 'Each option can only be chosen once')
  .refine((v) => v.length === 1 || !v.includes('everyone'), {
    message: '"Everyone" cannot be combined with another option',
  });

export const TOURNAMENT_STRUCTURE_LABELS: Record<TournamentStructure, string> = {
  round_robin: 'Round robin',
  knockout: 'Knockout',
  round_robin_knockout: 'Round robin + knockout',
};

export const TOURNAMENT_STRUCTURE_DESCRIPTIONS: Record<TournamentStructure, string> = {
  round_robin: 'Every team plays every other team once. Standings decide the winner.',
  knockout: 'Lose a match and you’re out. Winners advance until one team remains.',
  round_robin_knockout:
    'Teams play a round-robin group stage first, then the top teams advance to a knockout stage.',
};

export const TEAM_SELECTION_MODES = ['prebuilt_rosters', 'draft_based'] as const;
export const teamSelectionModeSchema = z.enum(TEAM_SELECTION_MODES);
export type TeamSelectionMode = z.infer<typeof teamSelectionModeSchema>;

export const TEAM_SELECTION_MODE_LABELS: Record<TeamSelectionMode, string> = {
  prebuilt_rosters: 'Pre-built rosters',
  draft_based: 'Draft-based',
};

export const TEAM_SELECTION_MODE_DESCRIPTIONS: Record<TeamSelectionMode, string> = {
  prebuilt_rosters: 'Each manager registers with a team and roster they’ve already put together.',
  draft_based:
    'Players register individually into a pool and are later drafted onto teams. (The draft itself isn’t run through the platform yet, this just records the intended format.)',
};

export const TOURNAMENT_GENDER_CATEGORIES = ['mens', 'womens', 'mixed'] as const;
export const tournamentGenderCategorySchema = z.enum(TOURNAMENT_GENDER_CATEGORIES);
export type TournamentGenderCategory = z.infer<typeof tournamentGenderCategorySchema>;

export const TOURNAMENT_GENDER_CATEGORY_LABELS: Record<TournamentGenderCategory, string> = {
  mens: "Men's",
  womens: "Women's",
  mixed: 'Mixed',
};

export function monthOnly(label: string) {
  return z
    .string()
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, `${label} must be a valid month`)
    .refine((v) => {
      const now = new Date();
      const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      return v <= currentMonth;
    }, `${label} cannot be in the future`)
    .refine((v) => {
      const earliestYear = new Date().getUTCFullYear() - MAX_AGE_YEARS;
      return Number(v.slice(0, 4)) >= earliestYear;
    }, `${label} must be within the past ${MAX_AGE_YEARS} years`)
    .nullish();
}

export const tournamentAgeGroupInputSchema = z
  .object({
    ageGroupId: z.string().min(1, 'Age group is required'),
    bornAfter: monthOnly('Born after'),
    bornBefore: monthOnly('Born before'),
    genderCategory: tournamentGenderCategorySchema,
    registrationStartDate: dateOnly('Registration start date', true),
    registrationEndDate: dateOnly('Registration end date', true),
    capacity: z.number().int().positive().nullish(),
    format: z.string().trim().min(1, 'Format is required').max(50),
    entryFee: z.number().nonnegative().nullish(),
    oversPerInnings: z.number().int().positive().max(200).nullish(),
  })
  .refine((v) => v.bornAfter == null || v.bornBefore == null || v.bornAfter <= v.bornBefore, {
    message: 'Born after must not be later than born before',
    path: ['bornBefore'],
  })
  .refine((v) => new Date(v.registrationStartDate) <= new Date(v.registrationEndDate), {
    message: 'Registration start date must not be after the end date',
    path: ['registrationEndDate'],
  });
export type TournamentAgeGroupInput = z.infer<typeof tournamentAgeGroupInputSchema>;

function noDuplicateAgeGroups(ageGroups: { ageGroupId: string }[]): boolean {
  return new Set(ageGroups.map((g) => g.ageGroupId)).size === ageGroups.length;
}

export const createTournamentSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(150),
    description: z.string().trim().max(4000).nullish(),
    structure: tournamentStructureSchema,
    teamSelectionMode: teamSelectionModeSchema,
    rules: z.string().trim().max(10000).nullish(),
    startDate: dateOnly('Start date'),
    endDate: dateOnly('End date'),
    capacity: z.number().int().positive().nullish(),
    prizePoolAmount: z.number().nonnegative().nullish(),
    prizePoolDescription: z.string().trim().max(1000).nullish(),
    locationCity: z.string().trim().min(1, 'City is required').max(100).transform(toTitleCase),
    locationState: z.string().trim().min(1, 'State is required').max(100).transform(toTitleCase),
    surfaceTypeId: z.string().min(1).nullish(),
    maxMarqueePlayers: z.number().int().positive().max(50).nullish(),
    notifyOnPublish: z.boolean().default(false),
    notifyAudiences: notifyAudiencesSchema.default(['everyone']),
    notifyState: z.string().trim().min(1).max(100).nullish(),
    ageGroups: z.array(tournamentAgeGroupInputSchema).min(1, 'Select at least one age group'),
  })
  .refine((v) => new Date(v.startDate) <= new Date(v.endDate), {
    message: 'Start date must not be after the end date',
    path: ['endDate'],
  })
  .refine((v) => !v.notifyOnPublish || v.notifyAudiences.length >= 1, {
    message: 'Choose who to notify',
    path: ['notifyAudiences'],
  })
  .refine((v) => !v.notifyOnPublish || !v.notifyAudiences.includes('state') || !!v.notifyState, {
    message: 'Choose a state to notify',
    path: ['notifyState'],
  })
  .refine((v) => noDuplicateAgeGroups(v.ageGroups), {
    message: 'Each age group can only be selected once',
    path: ['ageGroups'],
  })
  .refine((v) => v.ageGroups.every((g) => new Date(g.registrationEndDate) <= new Date(v.endDate)), {
    message: 'Registration end date must not be after the tournament end date',
    path: ['ageGroups'],
  });
export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;

export const updateTournamentSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(150).optional(),
    description: z.string().trim().max(4000).nullish(),
    structure: tournamentStructureSchema.optional(),
    teamSelectionMode: teamSelectionModeSchema.optional(),
    rules: z.string().trim().max(10000).nullish(),
    startDate: dateOnly('Start date').optional(),
    endDate: dateOnly('End date').optional(),
    capacity: z.number().int().positive().nullish(),
    prizePoolAmount: z.number().nonnegative().nullish(),
    prizePoolDescription: z.string().trim().max(1000).nullish(),
    locationCity: z.string().trim().max(100).transform(toTitleCase).nullish(),
    locationState: z.string().trim().max(100).transform(toTitleCase).nullish(),
    surfaceTypeId: z.string().min(1).nullish(),
    maxMarqueePlayers: z.number().int().positive().max(50).nullish(),
    notifyOnPublish: z.boolean().optional(),
    notifyAudiences: notifyAudiencesSchema.optional(),
    notifyState: z.string().trim().min(1).max(100).nullish(),
    ageGroups: z
      .array(tournamentAgeGroupInputSchema)
      .min(1, 'Select at least one age group')
      .optional(),
  })
  .refine((v) => !v.startDate || !v.endDate || new Date(v.startDate) <= new Date(v.endDate), {
    message: 'Start date must not be after the end date',
    path: ['endDate'],
  })
  .refine((v) => !v.notifyOnPublish || (v.notifyAudiences?.length ?? 0) >= 1, {
    message: 'Choose who to notify',
    path: ['notifyAudiences'],
  })
  .refine((v) => !v.notifyOnPublish || !v.notifyAudiences?.includes('state') || !!v.notifyState, {
    message: 'Choose a state to notify',
    path: ['notifyState'],
  })
  .refine((v) => !v.ageGroups || noDuplicateAgeGroups(v.ageGroups), {
    message: 'Each age group can only be selected once',
    path: ['ageGroups'],
  });
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
