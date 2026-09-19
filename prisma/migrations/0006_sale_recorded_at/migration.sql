ALTER TABLE "Sale" ADD COLUMN "recordedAt" TIMESTAMPTZ(3);
UPDATE "Sale" SET "recordedAt" = "occurredAt";
ALTER TABLE "Sale" ALTER COLUMN "recordedAt" SET NOT NULL;
