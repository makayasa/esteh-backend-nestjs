-- P5: penjualan QRIS pending + bukti privat (Q10, Q26, Q27).
ALTER TABLE "Sale" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'cash'
  CHECK ("method" IN ('cash', 'qris'));
ALTER TABLE "Sale" ADD COLUMN "evidencePath" TEXT;
ALTER TABLE "Sale" ADD COLUMN "evidenceMime" TEXT;
ALTER TABLE "Sale" ADD COLUMN "evidenceSize" INTEGER;
ALTER TABLE "Sale" ADD COLUMN "evidenceAt" TIMESTAMPTZ(3);
ALTER TABLE "Sale" ADD COLUMN "evidenceBy" TEXT REFERENCES "Account"("id");
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_evidenceSize_check"
  CHECK ("evidenceSize" IS NULL OR "evidenceSize" BETWEEN 1 AND 5242880);

-- P5: metode QRIS memiliki penerimaan setelah konfirmasi manual merchant;
-- trigger receipt_matches_total tetap menuntut nominal = total backend.
ALTER TABLE "Receipt" DROP CONSTRAINT "Receipt_method_check";
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_method_check"
  CHECK ("method" IN ('cash', 'qris'));

-- Q26: pengecualian admin tanpa bukti wajib menyimpan alasan dan referensi
-- transaksi merchant (audit tetap mencatat pelaku/waktu).
ALTER TABLE "Receipt" ADD COLUMN "merchantRef" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "confirmReason" TEXT;