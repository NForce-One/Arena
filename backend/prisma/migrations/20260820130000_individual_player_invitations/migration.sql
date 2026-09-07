-- Generalizes tournament_invitations to support inviting an individual
-- PLAYER, not just a team. Mirrors registrations' own exactly-one-of-
-- user/team idiom (see 20260715000002_critical_invariants).

-- AlterTable
ALTER TABLE "tournament_invitations" ALTER COLUMN "team_id" DROP NOT NULL;
ALTER TABLE "tournament_invitations" ADD COLUMN "user_id" TEXT;
ALTER TABLE "tournament_invitations" ADD COLUMN "eligibility_overridden" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "tournament_invitations"
  ADD CONSTRAINT "tournament_invitations_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "tournament_invitations_user_id_idx" ON "tournament_invitations"("user_id");

-- An invitation belongs to exactly one entity, same shape as registrations_one_entity.
ALTER TABLE "tournament_invitations"
  ADD CONSTRAINT "tournament_invitations_one_entity"
  CHECK (num_nonnulls("team_id", "user_id") = 1);

-- The old single partial unique index covered team_id only (it was NOT NULL
-- at the time). Replace it with one scoped index per entity type, same
-- "only one PENDING invite at a time" semantics as before.
DROP INDEX "tournament_invitations_pending_uq";

CREATE UNIQUE INDEX "tournament_invitations_pending_team_uq"
  ON "tournament_invitations" ("tournament_id", "team_id")
  WHERE status = 'invited' AND "team_id" IS NOT NULL;

CREATE UNIQUE INDEX "tournament_invitations_pending_user_uq"
  ON "tournament_invitations" ("tournament_id", "user_id")
  WHERE status = 'invited' AND "user_id" IS NOT NULL;
