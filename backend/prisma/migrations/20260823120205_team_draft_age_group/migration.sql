-- DropForeignKey
ALTER TABLE "age_groups" DROP CONSTRAINT "age_groups_organizer_id_fkey";

-- DropForeignKey
ALTER TABLE "surface_types" DROP CONSTRAINT "surface_types_organizer_id_fkey";

-- DropForeignKey
ALTER TABLE "tournaments" DROP CONSTRAINT "tournaments_surface_type_id_fkey";

-- DropIndex
DROP INDEX "registration_player_payments_registration_id_idx";

-- AlterTable
ALTER TABLE "registration_player_payments" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "draft_tournament_age_group_id" TEXT;

-- AddForeignKey
ALTER TABLE "age_groups" ADD CONSTRAINT "age_groups_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surface_types" ADD CONSTRAINT "surface_types_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_surface_type_id_fkey" FOREIGN KEY ("surface_type_id") REFERENCES "surface_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_draft_tournament_age_group_id_fkey" FOREIGN KEY ("draft_tournament_age_group_id") REFERENCES "tournament_age_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
