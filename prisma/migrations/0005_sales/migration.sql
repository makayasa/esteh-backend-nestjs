CREATE TABLE "Sale" (
  "id" TEXT PRIMARY KEY,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "recordedBy" TEXT NOT NULL REFERENCES "Account"("id")
);
CREATE TABLE "SaleItem" (
  "id" TEXT PRIMARY KEY,
  "saleId" TEXT NOT NULL REFERENCES "Sale"("id"),
  "productId" TEXT NOT NULL REFERENCES "Product"("id"),
  "name" TEXT NOT NULL,
  "unitPrice" INTEGER NOT NULL CHECK ("unitPrice" BETWEEN 1 AND 1000000000),
  "quantity" INTEGER NOT NULL CHECK ("quantity" BETWEEN 1 AND 10000)
);
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");
CREATE TABLE "Receipt" (
  "id" TEXT PRIMARY KEY,
  "saleId" TEXT NOT NULL UNIQUE REFERENCES "Sale"("id"),
  "method" TEXT NOT NULL CHECK ("method" = 'cash'),
  "amount" INTEGER NOT NULL CHECK ("amount" BETWEEN 1 AND 1000000000),
  "receivedAt" TIMESTAMPTZ(3) NOT NULL,
  "receivedBy" TEXT NOT NULL REFERENCES "Account"("id")
);

-- Native DB invariant: penerimaan tunai selalu sama dengan total backend
-- (sum unitPrice * quantity); client tidak dapat mengganti nominal.
CREATE FUNCTION receipt_matches_total() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."amount" <> (
    SELECT COALESCE(SUM("unitPrice" * "quantity"), 0)
    FROM "SaleItem" WHERE "saleId" = NEW."saleId"
  ) THEN
    RAISE EXCEPTION 'Receipt amount must equal sale total';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER receipt_matches_total BEFORE INSERT OR UPDATE ON "Receipt"
FOR EACH ROW EXECUTE FUNCTION receipt_matches_total();
