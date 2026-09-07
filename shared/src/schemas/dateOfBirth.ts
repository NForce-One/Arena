import { z } from 'zod';

export const MAX_AGE_YEARS = 100;

export const MIN_AGE_YEARS = 4;

export const ADULT_AGE_YEARS = 18;

export function isParsableDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

export function isNotFutureDate(value: string): boolean {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return true;
  const now = new Date();
  const endOfTodayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    23,
    59,
    59,
    999,
  );
  return t <= endOfTodayUtc;
}

function isAtLeastYearsOld(value: string, years: number): boolean {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return true;
  const now = new Date();
  const cutoffUtc = Date.UTC(
    now.getUTCFullYear() - years,
    now.getUTCMonth(),
    now.getUTCDate(),
    23,
    59,
    59,
    999,
  );
  return t <= cutoffUtc;
}

export function isOldEnough(value: string): boolean {
  return isAtLeastYearsOld(value, MIN_AGE_YEARS);
}

export function isAdultDate(value: string): boolean {
  return isAtLeastYearsOld(value, ADULT_AGE_YEARS);
}

export function isPlausibleBirthYear(value: string): boolean {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return true;
  const earliestYear = new Date().getUTCFullYear() - MAX_AGE_YEARS;
  return d.getUTCFullYear() >= earliestYear;
}

export const FUTURE_DOB_MESSAGE = 'Date of birth cannot be in the future';
export const TOO_RECENT_DOB_MESSAGE = `Date of birth must be at least ${MIN_AGE_YEARS} years ago`;
export const EARLY_DOB_MESSAGE = `Enter a date within the past ${MAX_AGE_YEARS} years`;
export const UNDER_18_SIGNUP_DOB_MESSAGE = `You must be at least ${ADULT_AGE_YEARS} to create your own account`;

export const dateOfBirthSchema = z
  .string()
  .trim()
  .refine(isParsableDate, 'Enter a valid date')
  .refine(isNotFutureDate, FUTURE_DOB_MESSAGE)
  .refine(isOldEnough, TOO_RECENT_DOB_MESSAGE)
  .refine(isPlausibleBirthYear, EARLY_DOB_MESSAGE);

export const clearableDateOfBirthSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || isParsableDate(v), 'Enter a valid date')
  .refine((v) => v === '' || isNotFutureDate(v), FUTURE_DOB_MESSAGE)
  .refine((v) => v === '' || isOldEnough(v), TOO_RECENT_DOB_MESSAGE)
  .refine((v) => v === '' || isPlausibleBirthYear(v), EARLY_DOB_MESSAGE);
