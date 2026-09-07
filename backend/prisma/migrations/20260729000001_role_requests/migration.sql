-- Lets a signup ask for a non-player role; a platform_admin approves/denies.
-- Player is automatic (not requestable) and platform_admin is never
-- requestable — enforced at the Zod layer (requestedRoleSchema), not the DB,
-- same as other enum-subset rules in this codebase.

-- CreateEnum
CREATE TYPE "RoleRequestStatus" AS ENUM ('pending', 'approved', 'denied');

-- CreateTable
CREATE TABLE "role_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "requested_role" "RoleName" NOT NULL,
    "status" "RoleRequestStatus" NOT NULL DEFAULT 'pending',
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_requests_user_id_idx" ON "role_requests"("user_id");

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique index: only one PENDING request per user at a time. A
-- denied (or approved) request doesn't count, so the user can re-request —
-- same idiom as tournament_invitations_pending_uq. This can't be expressed
-- in schema.prisma directly, which is why it's hand-added here rather than
-- generated.
CREATE UNIQUE INDEX "role_requests_pending_uq"
  ON "role_requests" ("user_id")
  WHERE status = 'pending';
