import { AppError } from './errors';

export function tokenErrorFrom(result: { outcome: 'used' | 'expired' | 'invalid' }): AppError {
  switch (result.outcome) {
    case 'used':
      return new AppError(400, 'TOKEN_ALREADY_USED', 'This link has already been used.');
    case 'expired':
      return new AppError(400, 'TOKEN_EXPIRED', 'This link has expired. Please request a new one.');
    case 'invalid':
      return new AppError(400, 'TOKEN_INVALID', 'This link is not valid.');
  }
}
