-- Registration/capacity move from per-TOURNAMENT to per-BRACKET
-- (tournament_age_group). A player/team can now hold one active
-- registration in every eligible bracket of the same tournament
-- independently, each bracket with its own capacity. See
-- TournamentAgeGroup's Prisma doc comment and RegistrationService.

-- ── Per-bracket capacity ──────────────────────────────────────────────────
ALTER TABLE "tournament_age_groups" ADD COLUMN "capacity" INTEGER;

-- ── Retarget "one active registration per entity" from tournament-wide to
--    bracket-wide. No backfill needed: tournament_age_group_id is already
--    required and populated on every existing row.
DROP INDEX "registrations_active_user_uq";
DROP INDEX "registrations_active_team_uq";

CREATE UNIQUE INDEX "registrations_active_user_uq"
  ON "registrations" ("tournament_age_group_id", "user_id")
  WHERE status <> 'withdrawn' AND "user_id" IS NOT NULL;

CREATE UNIQUE INDEX "registrations_active_team_uq"
  ON "registrations" ("tournament_age_group_id", "team_id")
  WHERE status <> 'withdrawn' AND "team_id" IS NOT NULL;
