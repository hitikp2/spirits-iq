-- AlterTable: Add Stripe Connect fields to Transaction
ALTER TABLE "Transaction" ADD COLUMN "platformFee" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "connectedAccountId" TEXT;
