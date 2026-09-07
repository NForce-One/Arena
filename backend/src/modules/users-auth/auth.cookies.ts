import type { Response } from 'express';
import { env } from '../../config/env';

export const REFRESH_COOKIE = 'nfa_rt';

const isCrossOrigin = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const baseOptions = {
  httpOnly: true,
  sameSite: isCrossOrigin ? ('none' as const) : ('lax' as const),
  secure: isCrossOrigin || env.NODE_ENV === 'production',
  path: '/api/auth',
} as const;

export function setRefreshCookie(res: Response, raw: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE, raw, { ...baseOptions, expires: expiresAt });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions);
}
