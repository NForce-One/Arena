import {
  claimAccountSchema,
  confirmEmailChangeSchema,
  forgotPasswordSchema,
  loginSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
} from '@nforce/shared';
import { Router, type Request, type RequestHandler } from 'express';
import { validate } from '../../lib/validate';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from './auth.cookies';
import type { AuthContext, AuthService } from './auth.service';

const NEUTRAL_RESET_MESSAGE =
  'If an account exists for that email, a password reset link has been sent.';

export interface AuthRouteLimiters {
  signup?: RequestHandler;
  forgotPassword?: RequestHandler;
  resendVerification?: RequestHandler;
}

const passthrough: RequestHandler = (_req, _res, next) => next();

function ctxFrom(req: Request): AuthContext {
  const ctx: AuthContext = {};
  if (req.ip) ctx.ip = req.ip;
  const ua = req.get('user-agent');
  if (ua) ctx.userAgent = ua;
  return ctx;
}

export function buildAuthRoutes(auth: AuthService, limiters: AuthRouteLimiters = {}): Router {
  const router = Router();

  router.post('/signup', limiters.signup ?? passthrough, async (req, res) => {
    const input = validate(signupSchema, req.body);
    const user = await auth.signup(input, ctxFrom(req));
    res.status(201).json({
      user,
      message: 'Account created. Check your email for a verification link.',
    });
  });

  router.post('/verify-email', async (req, res) => {
    const input = validate(verifyEmailSchema, req.body);
    await auth.verifyEmail(input.token);
    res.json({ ok: true, message: 'Email verified. You can now sign in.' });
  });

  router.post(
    '/resend-verification',
    limiters.resendVerification ?? passthrough,
    async (req, res) => {
      const input = validate(resendVerificationSchema, req.body);
      await auth.resendVerification(input.email);
      res.json({
        ok: true,
        message: 'If that account needs verification, an email has been sent.',
      });
    },
  );

  router.post('/login', async (req, res) => {
    const input = validate(loginSchema, req.body);
    const result = await auth.login(input, ctxFrom(req));
    setRefreshCookie(res, result.refreshToken.raw, result.refreshToken.expiresAt);
    res.json({ user: result.user, accessToken: result.accessToken });
  });

  router.post('/refresh', async (req, res) => {
    const raw = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    const result = await auth.refresh(raw, ctxFrom(req));
    setRefreshCookie(res, result.refreshToken.raw, result.refreshToken.expiresAt);
    res.json({ user: result.user, accessToken: result.accessToken });
  });

  router.post('/logout', async (req, res) => {
    const raw = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    await auth.logout(raw);
    clearRefreshCookie(res);
    res.status(204).end();
  });

  router.post('/forgot-password', limiters.forgotPassword ?? passthrough, async (req, res) => {
    const input = validate(forgotPasswordSchema, req.body);
    await auth.forgotPassword(input.email);
    res.json({ ok: true, message: NEUTRAL_RESET_MESSAGE });
  });

  router.post('/reset-password', async (req, res) => {
    const input = validate(resetPasswordSchema, req.body);
    await auth.resetPassword(input, ctxFrom(req));
    res.json({ ok: true, message: 'Password changed. Please sign in with your new password.' });
  });

  router.post('/claim-account', async (req, res) => {
    const input = validate(claimAccountSchema, req.body);
    await auth.claimAccount(input);
    res.json({ ok: true, message: 'Account set up. You can now sign in.' });
  });

  router.post('/confirm-email-change', async (req, res) => {
    const input = validate(confirmEmailChangeSchema, req.body);
    await auth.confirmEmailChange(input.token);
    res.json({ ok: true, message: 'Email updated. Sign in with your new address next time.' });
  });

  return router;
}
