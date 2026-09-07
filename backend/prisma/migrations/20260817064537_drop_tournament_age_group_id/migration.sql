-- Deferred second step of the tournament_age_groups migration, applied only
-- after the additive migration + backend/frontend were fully verified.
-- Every consumer of the old single age_group_id has been replaced by
-- tournament_age_groups; the column is dead weight now.
ALTER TABLE "tournaments" DROP CONSTRAINT "tournaments_age_group_id_fkey";

ALTER TABLE "tournaments" DROP COLUMN "age_group_id";
