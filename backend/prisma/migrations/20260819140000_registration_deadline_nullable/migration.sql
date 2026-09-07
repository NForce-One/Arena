-- Registration Deadline is being retired as a UI/API-collected field (it was
-- always display-only, never read by any enforcement check — End Date alone
-- gates when registration closes; see tournamentAgeGroupInputSchema).
-- Made nullable rather than dropped: existing rows keep their historical
-- value, and the app simply stops writing/selecting the column going
-- forward. Safe, non-destructive, reversible.
ALTER TABLE "tournament_age_groups" ALTER COLUMN "registration_deadline" DROP NOT NULL;
