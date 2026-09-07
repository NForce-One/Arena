-- AlterTable
ALTER TABLE "users" ADD COLUMN "club_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_club_id_key" ON "users"("club_id");
