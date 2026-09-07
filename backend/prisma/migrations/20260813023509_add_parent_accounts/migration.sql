-- AlterEnum
ALTER TYPE "OneTimeTokenType" ADD VALUE 'account_claim';

-- AlterEnum
ALTER TYPE "RoleName" ADD VALUE 'parent';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "claim_invite_sent_at" TIMESTAMPTZ(6),
ADD COLUMN     "managed_by_parent_id" TEXT;

-- CreateIndex
CREATE INDEX "users_managed_by_parent_id_idx" ON "users"("managed_by_parent_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_managed_by_parent_id_fkey" FOREIGN KEY ("managed_by_parent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
