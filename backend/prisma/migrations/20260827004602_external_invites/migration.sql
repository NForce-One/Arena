-- CreateEnum
CREATE TYPE "ExternalInviteRole" AS ENUM ('player', 'team_manager');

-- CreateEnum
CREATE TYPE "ExternalInviteStatus" AS ENUM ('pending', 'fulfilled');

-- CreateTable
CREATE TABLE "external_invites" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "ExternalInviteRole" NOT NULL,
    "tournament_id" TEXT,
    "tournament_age_group_id" TEXT,
    "invited_by_organizer_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "ExternalInviteStatus" NOT NULL DEFAULT 'pending',
    "claimed_by_user_id" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_invites_token_hash_key" ON "external_invites"("token_hash");

-- CreateIndex
CREATE INDEX "external_invites_tournament_id_idx" ON "external_invites"("tournament_id");

-- CreateIndex
CREATE INDEX "external_invites_claimed_by_user_id_idx" ON "external_invites"("claimed_by_user_id");

-- AddForeignKey
ALTER TABLE "external_invites" ADD CONSTRAINT "external_invites_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_invites" ADD CONSTRAINT "external_invites_tournament_age_group_id_fkey" FOREIGN KEY ("tournament_age_group_id") REFERENCES "tournament_age_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_invites" ADD CONSTRAINT "external_invites_invited_by_organizer_id_fkey" FOREIGN KEY ("invited_by_organizer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_invites" ADD CONSTRAINT "external_invites_claimed_by_user_id_fkey" FOREIGN KEY ("claimed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
