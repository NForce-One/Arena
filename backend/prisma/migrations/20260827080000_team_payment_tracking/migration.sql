-- AlterTable
ALTER TABLE "registrations" ADD COLUMN     "team_payment_status" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
ADD COLUMN     "team_payment_amount_paid" DECIMAL(10,2);
