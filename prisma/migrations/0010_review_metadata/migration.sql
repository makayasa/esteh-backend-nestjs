ALTER TABLE "Sale" ADD COLUMN "settlement" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "confirmedAt" TIMESTAMPTZ(3);
UPDATE "Receipt" SET "confirmedAt" = "receivedAt" WHERE method = 'qris';
ALTER TABLE "Purchase" ADD COLUMN "reason" TEXT;
ALTER TABLE "Expense" ADD COLUMN "reason" TEXT;
