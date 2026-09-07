-- Organizer's own bookkeeping of who's paid, scoped per registration (never
-- globally per team/player) — see the schema comment on
-- RegistrationPlayerPayment. Plus an optional academy name for organizers and
-- team managers, shown on the public tournament page and in the organizer's
-- Registrations tab.

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'partial', 'completed');

-- CreateTable
CREATE TABLE "registration_player_payments" (
    "registration_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
    "payment_amount_paid" DECIMAL(10,2),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_player_payments_pkey" PRIMARY KEY ("registration_id","user_id")
);

-- AddForeignKey
ALTER TABLE "registration_player_payments"
  ADD CONSTRAINT "registration_player_payments_registration_id_fkey"
  FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "registration_player_payments"
  ADD CONSTRAINT "registration_player_payments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "registration_player_payments_registration_id_idx" ON "registration_player_payments"("registration_id");

-- AlterTable
ALTER TABLE "users" ADD COLUMN "academy_name" TEXT;
