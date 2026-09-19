# Handoff — p7-inventory-purchasing-expenses (issues #20–#25)

- Branch: p7-inventory-purchasing-expenses (worktree esteh-backend-nestjs-p7)
- Feature: p7-inventory-purchasing-expenses
- Plan: docs/plans/mvp-implementation-plan.md#p7--stok-pembelian-dan-pengeluaran
- Latest progress: harness/progress/2026-09-19-p7-inventory-purchasing.md

## Verified Now

- `npm run test:api` lulus penuh (exit 0) pada postgres 17 ephemeral dengan
  `prisma migrate deploy`: 17 kelompok PASS, termasuk 7 kelompok P7:
  - Pembelian 1.000 gram menambah stok tepat sekali; retry konkuren idempoten;
    alat (materialId null) tidak menyentuh stok; tidak ada jalur penerimaan
    kedua (POST /purchases/:id/receive → 404).
  - Pemakaian/rusak/penyesuaian berriwayat lewat StockLedger; dua request
    berebut saldo → tepat satu 200, satu 400; saldo tetap non-negatif.
  - Kegagalan audit membatalkan seluruh pencatatan pembelian (Purchase,
    PurchaseItem, StockLedger, stok) tanpa sisa.
  - Koreksi mutasi/pembelian/pengeluaran berlink corrects/correctedBy tanpa
    hard-delete; koreksi saldo akhir negatif ditolak tanpa perubahan parsial;
    koreksi tidak dapat dikoreksi lagi.
  - Pengeluaran operasional terpisah, idempoten, terkoreksi.
  - Karyawan ditolak 403 untuk seluruh operasi tulis; invariant DB
    (stock non-negatif, ledger kind/delta/reason) ditolak langsung di DB.
- `harness:lint`, `harness:test` (13 pass), `build`, `lint`, `npm test`,
  `test:e2e` lulus.

## Changed

- `prisma/schema.prisma` + `prisma/migrations/0008_purchasing/`: Purchase,
  PurchaseItem, StockLedger, Expense, Material.stock mikro-satuan, trigger
  non-negatif stok, CHECK ledger.
- `src/purchasing/`: controller (purchases/expenses/stock) + service
  (pembelian, koreksi, mutasi, ledger, saldo, pengeluaran). Admin-only.
- `src/app.module.ts`: registrasi PurchasingModule.
- `scripts/test-api.mjs`: 7 kelompok acceptance P7.
- Fix atas kerja sesi sebelumnya: konversi mikro-satuan `10 ** scale`,
  `materialId: null` = alat, validasi payload mutate/koreksi.

## Broken Or Unverified

- `npm run verify` gagal di `harness:check`: dependency `p3-catalog` (dan
  rantai p1/p2) masih `blocked` keputusan pengguna — bukan regresi P7.
  Tracker p7 tetap `in_progress` karena aturan dependency-passing.
- Retur/refund pemasok belum ada modul (P6); hanya diuji tidak tersamar
  sebagai koreksi stok positif.

## Next Best Step

- Setelah pengguna mensertifikasi agregat (p1) sehingga p2/p3 `passing`:
  jalankan `npm run verify` utuh; bila hijau, naikkan tracker p7 ke
  `passing` dengan progress baru.

## Commands

- `npm run test:api` — acceptance P0–P7 di docker postgres ephemeral.
- `npm run verify` — gate lengkap (kini berhenti di harness:check karena
  dependency p3-catalog blocked).
- Worktree: `/Users/makayasa/Projects/project-esteh/esteh-backend-nestjs-p7`,
  branch `p7-inventory-purchasing-expenses`; jangan dikerjakan di repo utama
  (P5 paralel di sana).
- Commit `b0394e3`, merge main P5 (`44adbd0`, konflik test-api.mjs digabung blok P5+P7, fix assert flaky), dan `bb94c89` telah di-push; PR: https://github.com/makayasa/esteh-backend-nestjs/pull/32