-- Overs per innings moves from Tournament (one value for the whole
-- tournament) to TournamentAgeGroup (one value per bracket), matching the
-- earlier format/capacity/entry_fee migration — different brackets of the
-- same tournament can now play a different overs count (e.g. a T20 U-13
-- bracket alongside a One Day Open bracket).

ALTER TABLE "tournament_age_groups" ADD COLUMN "overs_per_innings" INTEGER;

-- Backfill from each row's own tournament, same source data the old
-- tournament-wide field held. Stays NULL where the tournament-level value
-- was already NULL.
UPDATE "tournament_age_groups" AS tag
SET "overs_per_innings" = t."overs_per_innings"
FROM "tournaments" AS t
WHERE tag."tournament_id" = t.id;
