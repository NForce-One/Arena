-- notifyAudience becomes multi-select: an organizer can now combine e.g.
-- "last year's players" + "last year's managers" + "a specific state" in one
-- publish notification instead of picking exactly one. 'everyone' stays
-- exclusive of every other choice (enforced in the Zod schema, not the DB)
-- since it's already a superset of them.

ALTER TABLE "tournaments" ADD COLUMN "notify_audiences" "TournamentNotifyAudience"[] NOT NULL DEFAULT '{}';

-- Backfill from each row's existing single value.
UPDATE "tournaments" SET "notify_audiences" = ARRAY["notify_audience"];
