-- AlterTable
ALTER TABLE "results" ADD COLUMN     "away_runs_total" INTEGER,
ADD COLUMN     "home_runs_total" INTEGER;

-- CreateTable
CREATE TABLE "player_innings_scores" (
    "id" TEXT NOT NULL,
    "result_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "runs" INTEGER NOT NULL,

    CONSTRAINT "player_innings_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "player_innings_scores_result_id_user_id_key" ON "player_innings_scores"("result_id", "user_id");

-- AddForeignKey
ALTER TABLE "player_innings_scores" ADD CONSTRAINT "player_innings_scores_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_innings_scores" ADD CONSTRAINT "player_innings_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_innings_scores" ADD CONSTRAINT "player_innings_scores_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
