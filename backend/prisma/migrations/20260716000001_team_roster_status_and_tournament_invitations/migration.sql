-- Adds pending/accepted/declined state for squad invitations and a new
-- organizer-invites-team-to-tournament flow.

-- CreateEnum
CREATE TYPE "TeamRosterStatus" AS ENUM ('invited', 'accepted', 'declined');

-- AlterTable: existing (seeded) roster rows default to "accepted" so they
-- stay valid members without a backfill; new invites explicitly pass "invited".
ALTER TABLE "team_roster" ADD COLUMN "status" "TeamRosterStatus" NOT NULL DEFAULT 'accepted';

-- CreateEnum
CREATE TYPE "TournamentInvitationStatus" AS ENUM ('invited', 'accepted', 'declined');

-- CreateTable
CREATE TABLE "tournament_invitations" (
    "id" TEXT NOT NULL,
    "tournament_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "invited_by_id" TEXT NOT NULL,
    "status" "TournamentInvitationStatus" NOT NULL DEFAULT 'invited',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_invitations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tournament_invitations"
  ADD CONSTRAINT "tournament_invitations_tournament_id_fkey"
  FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tournament_invitations"
  ADD CONSTRAINT "tournament_invitations_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tournament_invitations"
  ADD CONSTRAINT "tournament_invitations_invited_by_id_fkey"
  FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "tournament_invitations_tournament_id_idx" ON "tournament_invitations"("tournament_id");
CREATE INDEX "tournament_invitations_team_id_idx" ON "tournament_invitations"("team_id");

-- Partial unique index: only one PENDING invite per (tournament, team) at a
-- time. A declined invite doesn't count, so the organizer can re-invite —
-- same pattern as registrations_active_user_uq / registrations_active_team_uq.
CREATE UNIQUE INDEX "tournament_invitations_pending_uq"
  ON "tournament_invitations" ("tournament_id", "team_id")
  WHERE status = 'invited';
