-- Tracks whether a fulfilled team_manager ExternalInvite has already fired
-- its real TournamentInvitation once the manager's team exists (see
-- TeamService.create and ExternalInviteRepoPort.findUnconsumedTeamManagerInvites).
-- NULL = not yet fired; a manager's first team creation fires it and stamps
-- this so a later team never re-fires the same invite.
ALTER TABLE "external_invites" ADD COLUMN "team_invite_fired_at" TIMESTAMPTZ(6);
