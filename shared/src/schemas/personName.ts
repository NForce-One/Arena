import { z } from 'zod';

export const NAME_CHARS_REGEX = /^[\p{L}\p{M}0-9 '.-]+$/u;

export function personNameSchema(max: number) {
  return z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(max)
    .regex(/[A-Za-z]/, 'Name must contain at least one letter')
    .regex(
      NAME_CHARS_REGEX,
      'Name can only contain letters, numbers, spaces, apostrophes, hyphens and periods',
    );
}
