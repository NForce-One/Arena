-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notify_publish_states" TEXT[] NOT NULL DEFAULT '{}';
