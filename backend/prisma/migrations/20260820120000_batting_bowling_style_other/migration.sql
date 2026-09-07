-- AlterEnum
ALTER TYPE "BattingStyle" ADD VALUE 'other';

-- AlterEnum
ALTER TYPE "BowlingStyle" ADD VALUE 'other';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "batting_style_other" TEXT,
ADD COLUMN     "bowling_style_other" TEXT;
