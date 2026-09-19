-- P7: stok, pembelian, dan pengeluaran. Kuantitas disimpan sebagai mikro
-- satuan (10^-3) agar penjumlahan/perbandingan selalu integer di DB.
ALTER TABLE "Material" ADD COLUMN "stock" INTEGER NOT NULL DEFAULT 0
  CHECK ("stock" BETWEEN 0 AND 1000000000);

CREATE TABLE "Purchase" (
  "id" TEXT PRIMARY KEY,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL,
  "recordedBy" TEXT NOT NULL REFERENCES "Account"("id"),
  "correctsId" TEXT UNIQUE REFERENCES "Purchase"("id"),
  "correctedById" TEXT UNIQUE REFERENCES "Purchase"("id")
);
CREATE TABLE "PurchaseItem" (
  "id" TEXT PRIMARY KEY,
  "purchaseId" TEXT NOT NULL REFERENCES "Purchase"("id"),
  "materialId" TEXT REFERENCES "Material"("id"),
  "name" TEXT NOT NULL,
  "quantityMicros" INTEGER NOT NULL CHECK ("quantityMicros" BETWEEN 1 AND 1000000000),
  "unit" TEXT,
  "cost" INTEGER NOT NULL CHECK ("cost" BETWEEN 1 AND 1000000000)
);
CREATE INDEX "PurchaseItem_purchaseId_idx" ON "PurchaseItem"("purchaseId");

CREATE TABLE "StockLedger" (
  "id" TEXT PRIMARY KEY,
  "materialId" TEXT NOT NULL REFERENCES "Material"("id"),
  "kind" TEXT NOT NULL CHECK ("kind" IN ('purchase', 'usage', 'waste', 'adjustment', 'correction')),
  "deltaMicros" INTEGER NOT NULL CHECK ("deltaMicros" BETWEEN -1000000000 AND 1000000000 AND "deltaMicros" <> 0),
  -- pembelian menambah; pemakaian/rusak mengurangi; penyesuaian/koreksi bebas.
  CHECK (
    ("kind" = 'purchase' AND "deltaMicros" > 0)
    OR ("kind" IN ('usage', 'waste') AND "deltaMicros" < 0)
    OR ("kind" IN ('adjustment', 'correction'))
  ),
  -- mutasi manual/koreksi wajib beralasan; pembelian tanpa alasan.
  "reason" TEXT CHECK (length("reason") BETWEEN 1 AND 280),
  CHECK (
    ("kind" = 'purchase' AND "reason" IS NULL)
    OR ("kind" <> 'purchase' AND "reason" IS NOT NULL)
  ),
  "purchaseId" TEXT REFERENCES "Purchase"("id"),
  "correctsId" TEXT UNIQUE REFERENCES "StockLedger"("id"),
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL,
  "recordedBy" TEXT NOT NULL REFERENCES "Account"("id")
);
CREATE INDEX "StockLedger_materialId_idx" ON "StockLedger"("materialId");

-- Native DB invariant: saldo stok tidak boleh negatif pada update apa pun
-- (lapisan kedua di balik guard UPDATE ... WHERE stock >= qty).
CREATE FUNCTION material_non_negative_stock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."stock" < 0 THEN
    RAISE EXCEPTION 'Material stock cannot be negative';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER material_non_negative_stock BEFORE UPDATE ON "Material"
FOR EACH ROW EXECUTE FUNCTION material_non_negative_stock();

CREATE TABLE "Expense" (
  "id" TEXT PRIMARY KEY,
  "category" TEXT NOT NULL CHECK (length("category") BETWEEN 1 AND 64),
  "amount" INTEGER NOT NULL CHECK ("amount" BETWEEN 1 AND 1000000000),
  "note" TEXT CHECK (length("note") BETWEEN 1 AND 280),
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL,
  "recordedBy" TEXT NOT NULL REFERENCES "Account"("id"),
  "correctsId" TEXT UNIQUE REFERENCES "Expense"("id"),
  "correctedById" TEXT UNIQUE REFERENCES "Expense"("id")
);
