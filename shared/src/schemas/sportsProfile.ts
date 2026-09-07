import { z } from 'zod';
import { NAME_CHARS_REGEX } from './personName';

export const JERSEY_SIZES = ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl'] as const;
export const jerseySizeSchema = z.enum(JERSEY_SIZES);
export type JerseySize = z.infer<typeof jerseySizeSchema>;

export const JERSEY_SIZE_LABELS: Record<JerseySize, string> = {
  xs: 'XS',
  s: 'S',
  m: 'M',
  l: 'L',
  xl: 'XL',
  xxl: 'XXL',
  xxxl: 'XXXL',
};

export const BATTING_STYLES = ['right_handed', 'left_handed', 'other'] as const;
export const battingStyleSchema = z.enum(BATTING_STYLES);
export type BattingStyle = z.infer<typeof battingStyleSchema>;

export const BATTING_STYLE_LABELS: Record<BattingStyle, string> = {
  right_handed: 'Right-hand bat',
  left_handed: 'Left-hand bat',
  other: 'Other',
};

export const BOWLING_STYLES = [
  'none',
  'right_arm_fast',
  'right_arm_medium',
  'right_arm_offbreak',
  'right_arm_legbreak',
  'left_arm_fast',
  'left_arm_medium',
  'left_arm_orthodox',
  'left_arm_chinaman',
  'other',
] as const;
export const bowlingStyleSchema = z.enum(BOWLING_STYLES);
export type BowlingStyle = z.infer<typeof bowlingStyleSchema>;

export const BOWLING_STYLE_LABELS: Record<BowlingStyle, string> = {
  none: "Doesn't bowl",
  right_arm_fast: 'Right-arm fast',
  right_arm_medium: 'Right-arm medium',
  right_arm_offbreak: 'Right-arm offbreak',
  right_arm_legbreak: 'Right-arm legbreak (googly)',
  left_arm_fast: 'Left-arm fast',
  left_arm_medium: 'Left-arm medium',
  left_arm_orthodox: 'Left-arm orthodox (spin)',
  left_arm_chinaman: 'Left-arm chinaman',
  other: 'Other',
};

export function battingStyleLabel(
  style: BattingStyle | null | undefined,
  other: string | null | undefined,
): string {
  if (!style) return '';
  if (style === 'other') return other?.trim() || BATTING_STYLE_LABELS.other;
  return BATTING_STYLE_LABELS[style];
}

export function bowlingStyleLabel(
  style: BowlingStyle | null | undefined,
  other: string | null | undefined,
): string {
  if (!style) return '';
  if (style === 'other') return other?.trim() || BOWLING_STYLE_LABELS.other;
  return BOWLING_STYLE_LABELS[style];
}

export const PLAYING_ROLES = ['batsman', 'bowler', 'all_rounder', 'wicket_keeper'] as const;
export const playingRoleSchema = z.enum(PLAYING_ROLES);
export type PlayingRole = z.infer<typeof playingRoleSchema>;

export const PLAYING_ROLE_LABELS: Record<PlayingRole, string> = {
  batsman: 'Batsman',
  bowler: 'Bowler',
  all_rounder: 'All-rounder',
  wicket_keeper: 'Wicket-keeper',
};

export const HEIGHT_UNITS = ['cm', 'inches', 'ft'] as const;
export const heightUnitSchema = z.enum(HEIGHT_UNITS);
export type HeightUnit = z.infer<typeof heightUnitSchema>;

export const HEIGHT_UNIT_LABELS: Record<HeightUnit, string> = {
  cm: 'cm',
  inches: 'in',
  ft: 'ft',
};

export const WEIGHT_UNITS = ['kg', 'lbs'] as const;
export const weightUnitSchema = z.enum(WEIGHT_UNITS);
export type WeightUnit = z.infer<typeof weightUnitSchema>;

export const WEIGHT_UNIT_LABELS: Record<WeightUnit, string> = {
  kg: 'kg',
  lbs: 'lbs',
};

export const GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'] as const;
export const genderSchema = z.enum(GENDERS);
export type Gender = z.infer<typeof genderSchema>;

export const GENDER_LABELS: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
};

const phoneSchema = z
  .string({ message: 'Enter a valid phone number' })
  .trim()
  .regex(/^[0-9]{10}$/, 'Enter a valid 10-digit phone number');

const optionalTrimmedString = (max: number) =>
  z.union([z.string().trim().max(max), z.literal('')]).nullish();
const emergencyContactNameSchema = (max: number) =>
  z
    .string({ message: 'Emergency contact name is required' })
    .trim()
    .min(1, 'Emergency contact name is required')
    .max(max)
    .regex(/[A-Za-z]/, 'Name must contain at least one letter')
    .regex(
      NAME_CHARS_REGEX,
      'Name can only contain letters, numbers, spaces, apostrophes, hyphens and periods',
    );
const schoolSchema = (max: number) =>
  z
    .string({ message: 'School is required' })
    .trim()
    .min(1, 'School is required')
    .max(max)
    .regex(/[A-Za-z]/, 'School name must contain at least one letter');
const optionalPositiveNumber = (max: number) =>
  z.union([z.coerce.number().positive().max(max), z.null()]).nullish();

export const sportsProfileSchema = z
  .object({
    phone: phoneSchema,
    school: schoolSchema(50),
    jerseyNumber: z
      .number({ message: 'Jersey number is required' })
      .int()
      .min(0, 'Must be 0-99')
      .max(99, 'Must be 0-99'),
    jerseyName: z
      .string({ message: 'Jersey display name is required' })
      .trim()
      .min(1, 'Jersey display name is required')
      .max(20),
    jerseySize: z.enum(JERSEY_SIZES, { message: 'Select a jersey size' }),
    battingStyle: battingStyleSchema.nullish(),
    battingStyleOther: optionalTrimmedString(60),
    bowlingStyle: bowlingStyleSchema.nullish(),
    bowlingStyleOther: optionalTrimmedString(60),
    playingRole: playingRoleSchema.nullish(),
    heightValue: optionalPositiveNumber(300),
    heightUnit: heightUnitSchema.nullish(),
    weightValue: optionalPositiveNumber(500),
    weightUnit: weightUnitSchema.nullish(),
    gender: z.enum(GENDERS, { message: 'Select a gender' }),
    emergencyContactName: emergencyContactNameSchema(50),
    emergencyContactPhone: phoneSchema,
    consentAccepted: z.literal(true, {
      message: 'You must agree to the consent form to continue.',
    }),
  })
  .refine((v) => (v.heightValue != null) === (v.heightUnit != null), {
    message: 'Choose a unit for height',
    path: ['heightUnit'],
  })
  .refine((v) => (v.weightValue != null) === (v.weightUnit != null), {
    message: 'Choose a unit for weight',
    path: ['weightUnit'],
  })
  .refine((v) => v.battingStyle !== 'other' || !!v.battingStyleOther?.trim(), {
    message: 'Describe your batting style',
    path: ['battingStyleOther'],
  })
  .refine((v) => v.bowlingStyle !== 'other' || !!v.bowlingStyleOther?.trim(), {
    message: 'Describe your bowling style',
    path: ['bowlingStyleOther'],
  })
  .transform((v) => ({
    ...v,
    battingStyleOther: v.battingStyle === 'other' ? (v.battingStyleOther?.trim() ?? null) : null,
    bowlingStyleOther: v.bowlingStyle === 'other' ? (v.bowlingStyleOther?.trim() ?? null) : null,
  }));
export type SportsProfileInput = z.infer<typeof sportsProfileSchema>;
