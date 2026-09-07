-- CreateEnum
CREATE TYPE "JerseySize" AS ENUM ('xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl');

-- CreateEnum
CREATE TYPE "BattingStyle" AS ENUM ('right_handed', 'left_handed');

-- CreateEnum
CREATE TYPE "BowlingStyle" AS ENUM ('none', 'right_arm_fast', 'right_arm_medium', 'right_arm_offbreak', 'right_arm_legbreak', 'left_arm_fast', 'left_arm_medium', 'left_arm_orthodox', 'left_arm_chinaman');

-- CreateEnum
CREATE TYPE "PlayingRole" AS ENUM ('batsman', 'bowler', 'all_rounder', 'wicket_keeper');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "batting_style" "BattingStyle",
ADD COLUMN     "bowling_style" "BowlingStyle",
ADD COLUMN     "consent_accepted_at" TIMESTAMPTZ(6),
ADD COLUMN     "consented_by_user_id" TEXT,
ADD COLUMN     "emergency_contact_name" TEXT,
ADD COLUMN     "emergency_contact_phone" TEXT,
ADD COLUMN     "jersey_name" TEXT,
ADD COLUMN     "jersey_number" INTEGER,
ADD COLUMN     "jersey_size" "JerseySize",
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "playing_role" "PlayingRole",
ADD COLUMN     "school" TEXT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_consented_by_user_id_fkey" FOREIGN KEY ("consented_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
