import type { ZodType } from 'zod';
import { ValidationError } from './errors';

export function validate<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new ValidationError(details);
  }
  return result.data;
}
