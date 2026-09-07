-- Same idea as eligibility_overridden, for the OTHER non-overridable gate:
-- the bracket's own registration window. See schema.prisma's comment on
-- TournamentInvitation.windowOverridden.

-- AlterTable
ALTER TABLE "tournament_invitations" ADD COLUMN     "window_overridden" BOOLEAN NOT NULL DEFAULT false;
