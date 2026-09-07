-- Self-service email change: a signed-in user can request a new email,
-- confirmed via a one-time link sent to the NEW address (same lifecycle as
-- email verification / password reset / account claim). See
-- AuthService.requestEmailChange/confirmEmailChange.

ALTER TYPE "OneTimeTokenType" ADD VALUE 'email_change';

ALTER TABLE "users" ADD COLUMN "pending_email" TEXT;
