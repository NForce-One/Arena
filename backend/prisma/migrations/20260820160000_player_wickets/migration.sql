-- Adds a bowling figure (wickets taken) alongside each player's existing
-- batting figure (runs) on a per-innings score row.

-- AlterTable
ALTER TABLE "player_innings_scores" ADD COLUMN "wickets" INTEGER NOT NULL DEFAULT 0;
