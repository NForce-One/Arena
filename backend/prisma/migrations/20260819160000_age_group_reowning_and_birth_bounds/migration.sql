-- Age groups stop being an admin-managed global catalog: organizers can now
-- add their own brackets from the tournament wizard's Age Groups step, and
-- hide (never delete) ones they no longer want offered. `organizer_id NULL`
-- marks a permanent platform default, visible to everyone, never hideable.
ALTER TABLE "age_groups"
  ADD COLUMN "organizer_id" TEXT,
  ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "age_groups"
  ADD CONSTRAINT "age_groups_organizer_id_fkey"
  FOREIGN KEY ("organizer_id") REFERENCES "users"("id");

-- Per-tournament bracket bounds move from abstract ages to concrete
-- birth-date cutoffs (month granularity — always the 1st of the month).
ALTER TABLE "tournament_age_groups"
  ADD COLUMN "born_after" DATE,
  ADD COLUMN "born_before" DATE;

-- Backfill: derive birth-date cutoffs from each bracket's EFFECTIVE age
-- bounds (the tournament-level override if set, else the global AgeGroup's
-- own bound — the same resolveAgeBounds merge this app already used at
-- read time), relative to that tournament's own start date.
UPDATE "tournament_age_groups" tag
SET
  "born_after" = CASE WHEN COALESCE(tag."max_age", ag."max_age") IS NOT NULL
    THEN (t."start_date" - (COALESCE(tag."max_age", ag."max_age")::text || ' years')::interval)::date
    ELSE NULL END,
  "born_before" = CASE WHEN COALESCE(tag."min_age", ag."min_age") IS NOT NULL
    THEN (t."start_date" - (COALESCE(tag."min_age", ag."min_age")::text || ' years')::interval)::date
    ELSE NULL END
FROM "tournaments" t, "age_groups" ag
WHERE t."id" = tag."tournament_id" AND ag."id" = tag."age_group_id";

ALTER TABLE "tournament_age_groups"
  DROP COLUMN "min_age",
  DROP COLUMN "max_age";

-- Optional rules document (PDF/text), alongside the existing free-text
-- `rules` column — same "store only the key" pattern as users.photo_key.
ALTER TABLE "tournaments"
  ADD COLUMN "rules_document_key" TEXT;
