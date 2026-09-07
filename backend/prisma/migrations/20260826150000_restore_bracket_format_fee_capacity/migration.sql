-- Restores tournament_age_groups.capacity/format/entry_fee, which were
-- dropped by a migration applied directly to the shared Neon database
-- (20260826010000_drop_stray_tournament_age_group_columns) that has no
-- corresponding file in this repo. That migration ran because the columns
-- this migration re-adds were sitting on the shared DB from an earlier,
-- not-yet-pushed local migration — with no tracked migration file visible
-- in the repo at the time, they understandably looked orphaned/stray from
-- the other side. Now that the original migrations
-- (20260825120000_per_bracket_registration,
-- 20260825130000_per_bracket_format_fee) are committed and pushed, this
-- migration restores what they added, so the schema matches what the rest
-- of this codebase (Prisma schema, application code) already expects.

-- IF NOT EXISTS deliberately, not a plain ADD COLUMN: on a FRESH database
-- (every migration replayed from scratch, e.g. a shadow DB, `migrate
-- reset`, or a brand new environment) these columns already exist from
-- 20260825130000_per_bracket_format_fee — only the shared Neon DB's actual
-- history has the gap this migration exists to patch. Without IF NOT
-- EXISTS, a full replay fails on "column already exists" here.
ALTER TABLE "tournament_age_groups" ADD COLUMN IF NOT EXISTS "capacity" INTEGER;
ALTER TABLE "tournament_age_groups" ADD COLUMN IF NOT EXISTS "format" TEXT;
ALTER TABLE "tournament_age_groups" ADD COLUMN IF NOT EXISTS "entry_fee" DECIMAL(10, 2);

-- Backfill from each row's own tournament (same source data the original
-- migration backfilled from) — capacity/entry_fee stay NULL where the
-- tournament-level value was already NULL, format falls back to 'T20' if
-- the tournament's own format was somehow NULL.
UPDATE "tournament_age_groups" AS tag
SET "capacity" = t."capacity",
    "format" = COALESCE(t."format", 'T20'),
    "entry_fee" = t."entry_fee"
FROM "tournaments" AS t
WHERE tag."tournament_id" = t.id;

UPDATE "tournament_age_groups" SET "format" = 'T20' WHERE "format" IS NULL;

ALTER TABLE "tournament_age_groups" ALTER COLUMN "format" SET NOT NULL;
