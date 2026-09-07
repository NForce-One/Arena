-- Format and entry fee move from Tournament (one value for the whole
-- tournament) to TournamentAgeGroup (one value per bracket) — same pattern
-- as the earlier per-bracket capacity migration
-- (20260825120000_per_bracket_registration). Different brackets of the same
-- tournament can now play different formats at different entry fees.

-- 1. Add the new per-bracket columns, nullable for now so the backfill below
--    has somewhere to write into before format becomes required.
ALTER TABLE "tournament_age_groups" ADD COLUMN "format" TEXT;
ALTER TABLE "tournament_age_groups" ADD COLUMN "entry_fee" DECIMAL(10, 2);

-- 2. Backfill every existing bracket from its tournament's current
--    (soon-to-be-deprecated) top-level values, so no existing tournament's
--    format/fee silently disappears.
UPDATE "tournament_age_groups" AS tag
SET "format" = t."format",
    "entry_fee" = t."entry_fee"
FROM "tournaments" AS t
WHERE tag."tournament_id" = t.id;

-- 3. Defensive fallback — every existing tournament row had a non-null
--    format until this migration, so this should affect zero rows; guards
--    against SET NOT NULL failing below if that assumption is ever wrong.
UPDATE "tournament_age_groups" SET "format" = 'T20' WHERE "format" IS NULL;

-- 4. format is required going forward (entry_fee stays optional — null means
--    free, same convention Tournament.entry_fee always used).
ALTER TABLE "tournament_age_groups" ALTER COLUMN "format" SET NOT NULL;

-- 5. The old tournament-wide columns are deprecated (kept for historical
--    data, no longer read or written) — format in particular must become
--    nullable since nothing populates it for new tournaments any more.
ALTER TABLE "tournaments" ALTER COLUMN "format" DROP NOT NULL;
