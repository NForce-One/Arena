-- CreateEnum
CREATE TYPE "TournamentStructure" AS ENUM ('round_robin', 'knockout', 'round_robin_knockout');

-- CreateEnum
CREATE TYPE "TeamSelectionMode" AS ENUM ('prebuilt_rosters', 'draft_based');

-- CreateEnum
CREATE TYPE "TournamentGenderCategory" AS ENUM ('mens', 'womens', 'mixed');

-- AlterTable: new tournament-level scalar fields. structure/team_selection_mode
-- get real NOT NULL defaults in the same statement so existing rows need no
-- separate backfill for these two.
ALTER TABLE "tournaments"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "structure" "TournamentStructure" NOT NULL DEFAULT 'round_robin',
  ADD COLUMN "team_selection_mode" "TeamSelectionMode" NOT NULL DEFAULT 'prebuilt_rosters',
  ADD COLUMN "overs_per_innings" INTEGER,
  ADD COLUMN "rules" TEXT,
  ADD COLUMN "entry_fee" DECIMAL(10,2),
  ADD COLUMN "prize_pool_amount" DECIMAL(10,2),
  ADD COLUMN "prize_pool_description" TEXT,
  ADD COLUMN "notify_on_publish" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notified_at" TIMESTAMPTZ(6);

-- CreateTable: one eligibility bracket per tournament. Fixtures/standings/
-- capacity stay tournament-wide — this is metadata, not a scheduling division.
CREATE TABLE "tournament_age_groups" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "age_group_id" TEXT NOT NULL,
    "min_age" INTEGER,
    "max_age" INTEGER,
    "gender_category" "TournamentGenderCategory" NOT NULL,
    "registration_start_date" DATE NOT NULL,
    "registration_end_date" DATE NOT NULL,
    "registration_deadline" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_age_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tournament_age_groups_tournament_id_age_group_id_key"
  ON "tournament_age_groups"("tournament_id", "age_group_id");

CREATE INDEX "tournament_age_groups_tournament_id_idx" ON "tournament_age_groups"("tournament_id");

ALTER TABLE "tournament_age_groups"
  ADD CONSTRAINT "tournament_age_groups_tournament_id_fkey"
  FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tournament_age_groups"
  ADD CONSTRAINT "tournament_age_groups_age_group_id_fkey"
  FOREIGN KEY ("age_group_id") REFERENCES "age_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one TournamentAgeGroup per existing tournament, derived from its
-- current age_group_id. minAge/maxAge overrides stay NULL (inherit the global
-- AgeGroup's own bound — no behavior change for existing tournaments).
-- genderCategory = 'mixed' is the only non-breaking choice (no gender
-- restriction exists today). Registration window has no prior equivalent, so
-- it's anchored to the tournament's own start_date. Deterministic id makes
-- the next steps' joins unambiguous.
INSERT INTO "tournament_age_groups"
  ("id", "tournament_id", "age_group_id", "min_age", "max_age", "gender_category",
   "registration_start_date", "registration_end_date", "registration_deadline", "created_at")
SELECT
  'tag-' || t."id",
  t."id",
  t."age_group_id",
  NULL,
  NULL,
  'mixed',
  t."start_date" - INTERVAL '90 days',
  t."start_date",
  t."start_date",
  CURRENT_TIMESTAMP
FROM "tournaments" t;

-- AlterTable: registrations now claim a specific bracket. Nullable-first so
-- the backfill below can populate every existing row before tightening.
ALTER TABLE "registrations" ADD COLUMN "tournament_age_group_id" TEXT;

UPDATE "registrations" SET "tournament_age_group_id" = 'tag-' || "tournament_id";

ALTER TABLE "registrations" ALTER COLUMN "tournament_age_group_id" SET NOT NULL;

CREATE INDEX "registrations_tournament_age_group_id_idx" ON "registrations"("tournament_age_group_id");

ALTER TABLE "registrations"
  ADD CONSTRAINT "registrations_tournament_age_group_id_fkey"
  FOREIGN KEY ("tournament_age_group_id") REFERENCES "tournament_age_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: same treatment for tournament_invitations (the organizer picks
-- the bracket when inviting a team).
ALTER TABLE "tournament_invitations" ADD COLUMN "tournament_age_group_id" TEXT;

UPDATE "tournament_invitations" SET "tournament_age_group_id" = 'tag-' || "tournament_id";

ALTER TABLE "tournament_invitations" ALTER COLUMN "tournament_age_group_id" SET NOT NULL;

ALTER TABLE "tournament_invitations"
  ADD CONSTRAINT "tournament_invitations_tournament_age_group_id_fkey"
  FOREIGN KEY ("tournament_age_group_id") REFERENCES "tournament_age_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
