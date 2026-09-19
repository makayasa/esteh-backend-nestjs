# 2026-09-19 — p6-corrections-refunds (P6)

- Branch: p6-corrections-refunds (dari main fe4d7c5)
- Feature: p6-corrections-refunds
- Goal / scope: input susulan admin, koreksi lama/pengganti tanpa uang
  fiktif, pembatalan dengan dana terlihat, refund penuh sekali
  (Q11/Q12/Q20/Q21/Q23/Q25/Q36).

## Completed

- `prisma/migrations/0009_corrections_refunds/migration.sql` + schema:
  Sale.correctsId/correctedById (self-relation, unique), occurredBy
  (petugas susulan), manualRef, reason, cancelledAt/By/Reason; tabel Refund
  (unique saleId, CHECK nominal) + trigger `refund_matches_receipt` yang
  menolak refund yang tidak sama dengan penerimaan aktual.
- `src/sales/sales.service.ts`: `backfill` (admin; occurredAt wajib non-future,
  occurredBy divalidasi, manualRef+reason wajib, unitPrice historis per item,
  penerimaan cash pada waktu kejadian Q21), `correct` (item pengganti wajib
  unitPrice+reason; penerimaan efektif = total backend; waktu terima asli
  dipertahankan; metode QRIS wajib merchantRef; tolak koreksi-ganda,
  koreksi-atas-koreksi, koreksi setelah refund, koreksi batal),
  `cancel` (wajib reason; pending tanpa refund; lunas penerimaan tetap),
  `refund` (penuh saja; tanpa field nominal; wajib method+reason;
  occurredAt waktu uang kembali; tolak pending/ganda/koreksi). Lock
  `FOR UPDATE` baris Sale untuk konkurensi; status `cancelled` pada view;
  upload/confirm QRIS ditolak pada penjualan batal.
- `src/sales/sales.controller.ts` + `src/http.ts`: rute POST
  `/sales/backfill`, `/sales/:id/correct|cancel|refund` + OpenAPI bodies.
- `docs/api.md` bagian P6; test block P6 pada `scripts/test-api.mjs`
  (termasuk re-login karena waktu uji melompati idle 12 jam).

## Verification / evidence

| Command / check | Result / exit code | Scope |
| --- | --- | --- |
| `npm run test:api` | exit 0, PASS P6 backfill/correction/cancel/refund rules, concurrency, rollback | PostgreSQL nyata terisolasi: karyawan 403 pada 4 operasi; backfill mempertahankan occurredAt kemarin + recordedAt/petugas/referensi/harga historis (9000 dari 2×4500) + retry idempoten + payload asing 400; koreksi 10000→5000 tanpa refund (Refund=0), penerimaan lama 10000 masih terbaca, retry idempoten, koreksi-ganda & koreksi-atas-koreksi 409; koreksi total sama tidak mengubah jumlah penerimaan efektif; koreksi ke QRIS tanpa merchantRef 400, dengan merchantRef tersimpan; cancel pending tanpa refund + confirm atas batal 409 + cancel ulang 409; cancel lunas tidak menghapus penerimaan (6500 tetap); refund atas pending 400, payload nominal parsial 400, refund penuh 200 (nominal = penerimaan), retry idempoten, ganda 409, koreksi setelah refund 409, refund atas terkoreksi 409; trigger DB menolak refund ≠ penerimaan; dua refund & dua koreksi konkuren = 200+409; kegagalan audit membatalkan koreksi tanpa jejak |
| `npm run harness:lint`, `npm run harness:test` | exit 0 (13/13) | tooling |
| `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` | exit 0 | build + unit + e2e |
| `npm run harness:check` | GAGAL: dependency chain p4/p5/p7 (agregat P1–P3 menunggu keputusan pengguna) — bukan regresi P6 | gate state lint |

## Broken or unverified

- `npm run verify` gagal di `harness:check` karena rantai dependensi
  tracker (p5 dan p7 `in_progress`, p4 `blocked` menunggu keputusan agregat
  P1–P3). Semua gerbang lain hijau. Status p6 tetap `in_progress`.
- Asumsi desain (belum diputus pengguna, dicatat di handoff): pembatalan
  lunas tidak menuntut refund lebih dulu; refund metode aktual bebas teks
  1..32; koreksi QRIS→QRIS juga menuntut merchantRef.
- Laporan efektif (P8) belum ada; pengujian "pembayaran kedua" dilakukan
  lewat hitungan penerimaan efektif di DB, bukan endpoint laporan.
- npm audit: baseline advisory Prisma/mau; tanpa perubahan dependensi.
- Tidak menyentuh worktree P7; tidak push/PR/deploy.

## Next

Manager putuskan agregat P1–P3 → rantai p4/p5/p7/p6 dapat dinilai `passing`
dan gate hijau penuh; P8 (laporan JSON) siap dikerjakan dengan semantik
efektif/koreksi/refund yang kini teruji.

## Working tree / commits

Commit lokal di branch p6-corrections-refunds; tidak ada perubahan tersisa
setelah commit.