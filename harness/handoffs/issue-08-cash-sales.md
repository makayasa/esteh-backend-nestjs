# Handoff — issue-08-cash-sales (GitHub #8 / P4)

- Branch main, belum commit; file repo masih untracked.
- Feature p4-cash-sales: `blocked` — seluruh AC fungsional terbukti, status
  `passing` tertahan dependensi p3-catalog (agregat P1/P2, keputusan pengguna).
- issue-06-products kini `passing`: AC harga historis dan payload penjualan
  terbukti lewat #8. GitHub #6/#8 masih OPEN, belum push.
- Plan: docs/plans/mvp-implementation-plan.md#p4--penjualan-tunai-end-to-end;
  kontrak docs/api.md.
- Latest progress: harness/progress/2026-09-19-issue-08-cash-sales.md.

## Verified Now

`npm run test:api` exit 0 dengan blok baru: penjualan 2×Rp5.000 → satu
penerimaan tunai Rp10.000 (tanpa uang diserahkan/kembalian); field uang/tanggal
asing ditolak 400; snapshot harga tetap Rp5.000 setelah reprice katalog 6.500;
retry konkuren key sama satu efek (Sale=1, Receipt=1), payload beda 409;
trigger DB `receipt_matches_total` menolak penerimaan yang tidak sama dengan
total backend (INSERT/UPDATE); fault audit membatalkan Sale/SaleItem/Receipt;
karyawan hanya transaksi sendiri pada hari WIB berjalan, di luar scope 404;
karyawan tidak bisa backdate (tidak ada field tanggal, occurredAt server).
`npm run verify` exit 0 (harness check/lint/test, build, lint, 1 unit, 2 e2e).
Invariant diuji pada PostgreSQL nyata terisolasi.

## Changed

src/sales/ (module/service/controller), migration 0005_sales (Sale, SaleItem,
Receipt + CHECK + trigger), `IdentityService.write` menerima parameter roles
(default `['admin']`), app.module, http.ts (OpenAPI `/sales`, 403 "Role
required"), docs/api.md bagian Penjualan tunai, trackers issue-06 (passing),
p4 (blocked/evidence), p3/p2 (alasan blocked diperbarui), progress baru.

## Broken Or Unverified

- "Pencatatan tunai tidak mengurangi bahan" terpenuhi struktural (tidak ada
  jalur konsumsi; ledger P7), bukan uji negatif khusus.
- QRIS/pending (P5), input susulan admin (P6/P10), koreksi/refund, pelaporan
  (P8) belum ada; Receipt CHECK method 'cash' diperluas saat P5.
- p4-cash-sales tidak `passing`: validator menuntut dependensi p3-catalog
  passing; agregat P1/P2/P3 masih blocked menunggu keputusan pengguna.
- npm audit: 9 advisory (Prisma/mau) seperti sebelumnya; tanpa perubahan.
- .env pengguna tidak diubah; tidak ada secret dalam evidence.

## Next Best Step

Manager putuskan status agregat P1–P3 (bukti domain kini lengkap untuk
P1–P4). Setelah p3-catalog passing, p4-cash-sales bisa dinilai `passing` dan
GitHub #6/#8 ditutup dengan bukti. Lanjut P5 atau P7 sesuai plan.

## Commands

```bash
npm run test:api
npm run verify
npm run harness:index
npm run harness:check
```

Tidak commit/push/deploy. Graph perlu regenerasi setelah perubahan source.
