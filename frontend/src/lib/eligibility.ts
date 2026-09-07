import { ApiError } from './apiClient';
import { errorsFrom } from './forms';

const OVERRIDABLE_ELIGIBILITY_CODES = new Set([
  'AGE_GROUP_MISMATCH',
  'GENDER_CATEGORY_MISMATCH',
  'GENDER_REQUIRED',
  'PROFILE_INCOMPLETE',
  'DOB_REQUIRED',
]);

export function shouldOfferEligibilityOverride(err: unknown): boolean {
  return err instanceof ApiError && OVERRIDABLE_ELIGIBILITY_CODES.has(err.code);
}

export function eligibilityOverrideReason(err: unknown): string {
  return errorsFrom(err).banner ?? "This does not meet this age group's requirements.";
}

export function shouldOfferWindowOverride(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === 'REGISTRATION_WINDOW_CLOSED' || err.code === 'REGISTRATION_NOT_YET_OPEN')
  );
}

export function isWindowNotYetOpen(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'REGISTRATION_NOT_YET_OPEN';
}

export function shouldOfferCapacityOverride(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'TOURNAMENT_FULL';
}
