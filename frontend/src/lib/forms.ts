import type { ApiErrorDetail } from '@nforce/shared';
import type { ZodType } from 'zod';
import { ApiError } from './apiClient';

export type FieldErrors = Record<string, string>;

export function validateForm<T>(
  schema: ZodType<T>,
  data: unknown,
): { ok: true; data: T } | { ok: false; fields: FieldErrors } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  const fields: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  return { ok: false, fields };
}

export function errorsFrom(err: unknown): { fields: FieldErrors; banner: string | null } {
  if (err instanceof ApiError) {
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      const fields: FieldErrors = {};
      for (const d of err.details as ApiErrorDetail[]) fields[d.path] ??= d.message;
      return { fields, banner: null };
    }
    if (err.code === 'RATE_LIMITED') {
      const retry = (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
      return {
        fields: {},
        banner: retry
          ? `Too many attempts. Please try again in ${Math.ceil(retry / 60)} minute(s).`
          : err.message,
      };
    }
    return { fields: {}, banner: err.message };
  }
  return { fields: {}, banner: 'Something went wrong. Please try again.' };
}
