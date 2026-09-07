-- Lets an organizer's invite override a full tournament's capacity, and
-- keeps a lasting record of when that happened (not just a one-time
-- confirmation pop-up at invite time). See RegistrationService's
-- overrideCapacity option.

ALTER TABLE "registrations" ADD COLUMN "capacity_overridden" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "tournament_invitations" ADD COLUMN "capacity_overridden" BOOLEAN NOT NULL DEFAULT false;
