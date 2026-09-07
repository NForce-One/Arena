-- CreateEnum
CREATE TYPE "TournamentNotifyAudience" AS ENUM ('everyone', 'last_year_players', 'last_year_managers', 'state');

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "notify_audience" "TournamentNotifyAudience" NOT NULL DEFAULT 'everyone',
ADD COLUMN     "notify_state" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "state" TEXT;
