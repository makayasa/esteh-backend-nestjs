# 2026-09-19 — p7-inventory-purchasing-expenses (issues #20–#25)

- Branch: p7-inventory-purchasing-expenses (worktree esteh-backend-nestjs-p7)
- Feature: p7-inventory-purchasing-expenses
- Goal / scope: P7 — pembelian bahan/alat + penerimaan stok, mutasi stok
  (pemakaian/rusak/penyesuaian) + ledger, koreksi mutasi/pembelian/
  pengeluaran tanpa hard-delete, pengeluaran operasional.

## Completed

- `prisma/migrations/0008_purchasing/` + `prisma/schema.prisma`: Purchase,
  PurchaseItem, StockLedger, Expense, Material.stock (mikro satuan), trigger
  non-negatif stok, CHECK ledger (kind/delta/reason konsisten).
- `src/purchasing/` (module/controller/service): POST `/purchases`,
  `/purchases/:id/correct`, `/expenses`, `/expenses/:id/correct`,
  `/stock/usage|waste|adjustment`, `/stock/ledger/:id/correct`,
  GET `/stock`, `/stock/balances`, `/purchases`, `/expenses`. Semua tulisan
  admin-only via `identity.write` default roles `['admin']`.
- Perbaikan atas kerja sesi sebelumnya (worktree):
  - `factor` mikro-satuan: `1000 ** (3 - scale)` → `10 ** scale`
    (1 gram @scale 3 = 1000 mikro; scale 0 pcs tidak lagi melebihi MAX).
  - `materialId: null` pada item pembelian ditolak `text()` → kini null/absent
    = alat (tanpa stok).
  - Payload mutate/koreksi divalidasi angka hingga build TypeScript lolos.
- `src/app.module.ts`: daftarkan `PurchasingModule`.
- `scripts/test-api.mjs`: 7 kelompok acceptance P7 baru (pembelian atomik +
  retry idempoten + retry konkuren, mutasi + kontensi saldo, rollback
  pembelian via trigger reject_audit, koreksi mutasi/pembelian/pengeluaran,
  guard parsial, pengeluaran, penolakan karyawan, invariant DB).

## Verification / evidence

| Command / check | Result / exit code | Scope |
| --- | --- | --- |
| `npm run test:api` (docker postgres ephemeral + migrate deploy) | exit 0; PASS ×17 kelompok, termasuk 7 kelompok P7 | Pembelian 1.000 gram +1000 tepat sekali walau retry/konkuren; alat tanpa stok; tidak ada endpoint penerimaan kedua (404); mutasi riwayat; saldo non-negatif saat dua request berebut (200+400); kegagalan audit membatalkan Purchase/Item/Ledger/stok; koreksi mutasi/pembelian berlink tanpa hard-delete; koreksi saldo-akhir-negatif ditolak tanpa perubahan parsial; pengeluaran + koreksi idempoten; karyawan 403 untuk semua tulisan; invariant UPDATE stock=-1 dan INSERT ledger ditolak DB |
| `npm run verify` | GAGAL di `harness:check`: dependency `p3-catalog` belum `passing` | Bukan regresi P7; rantai p1→p2→p3 `blocked` menunggu keputusan pengguna (agregat). Sisa rantai dijalankan manual |
| `npm run harness:lint` + `npm run harness:test` | exit 0; 13 test pass | Tooling gate |
| `npm run build` / `npm run lint` | exit 0 | Build + oxlint type-aware |
| `npm test` / `npm run test:e2e` | exit 0; 1 + 2 test pass | Unit + e2e smoke |

## Broken or unverified

- `passing` belum dapat dicatat: p3-catalog (dan rantai di atasnya) masih
  `blocked` keputusan pengguna; `harness:check` menolak dependency belum
  passing. Seluruh acceptance criteria P7 sendiri terpenuhi dan teruji.
- Retur/refund pemasok (P6) belum ada modulnya; diuji hanya bahwa ledger
  koreksi pembelian tidak berdelta positif.
- Migration diuji lewat `prisma migrate deploy` pada DB postgres nyata di
  test:api (bukan restart volume penuh).

## Next

- Setelah pengguna memutuskan sertifikasi agregat (p1) dan rantai p2/p3
  `passing`, jalankan `npm run verify` utuh lalu naikkan tracker p7 ke
  `passing`.

## Working tree / commits

- Commit lokal di branch p7-inventory-purchasing-expenses; belum push.