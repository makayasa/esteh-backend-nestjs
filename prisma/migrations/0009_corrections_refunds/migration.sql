-- P6: koreksi lama/pengganti, input susulan, pembatalan, refund penuh
-- (Q11, Q12, Q20, Q21, Q25, Q36). Tanpa hard-delete: riwayat lama tetap.
ALTER TABLE "Sale" ADD COLUMN "correctsId" TEXT REFERENCES "Sale"("id");
ALTER TABLE "Sale" ADD COLUMN "correctedById" TEXT REFERENCES "Sale"("id");
ALTER TABLE "Sale" ADD COLUMN "occurredBy" TEXT REFERENCES "Account"("id");
ALTER TABLE "Sale" ADD COLUMN "manualRef" TEXT;
ALTER TABLE "Sale" ADD COLUMN "reason" TEXT;
ALTER TABLE "Sale" ADD COLUMN "cancelledAt" TIMESTAMPTZ(3);
ALTER TABLE "Sale" ADD COLUMN "cancelledBy" TEXT REFERENCES "Account"("id");
ALTER TABLE "Sale" ADD COLUMN "cancelReason" TEXT;
CREATE UNIQUE INDEX "Sale_correctsId_key" ON "Sale"("correctsId");
CREATE UNIQUE INDEX "Sale_correctedById_key" ON "Sale"("correctedById");

-- Refund penuh: satu per penjualan lunas; nominal selalu sama dengan
-- penerimaan aktual (tidak ada refund fiktif/parsial di level DB).
CREATE TABLE "Refund" (
  "id" TEXT PRIMARY KEY,
  "saleId" TEXT NOT NULL UNIQUE REFERENCES "Sale"("id"),
  "amount" INTEGER NOT NULL CHECK ("amount" BETWEEN 1 AND 1000000000),
  "method" TEXT NOT NULL CHECK (length("method") BETWEEN 1 AND 32),
  "reason" TEXT NOT NULL CHECK (length("reason") BETWEEN 1 AND 500),
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL,
  "recordedBy" TEXT NOT NULL REFERENCES "Account"("id")
);
CREATE INDEX "Refund_recordedBy_idx" ON "Refund"("recordedBy");

CREATE FUNCTION refund_matches_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."amount" <> (
    SELECT r."amount" FROM "Receipt" r WHERE r."saleId" = NEW."saleId"
  ) THEN
    RAISE EXCEPTION 'Refund amount must equal receipt amount';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER refund_matches_receipt BEFORE INSERT OR UPDATE ON "Refund"
FOR EACH ROW EXECUTE FUNCTION refund_matches_receipt();