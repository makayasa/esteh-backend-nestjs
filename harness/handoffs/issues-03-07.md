# Handoff — issues-03-07

- Branch main; sudah di-commit dan di-push ke origin/main (6111c04 + merge
  ea43bfc). Diff gate `npm run harness:check -- --base ff40603` lulus.
- Features: issue-03-login, issue-04-session, issue-05-accounts,
  issue-06-products, issue-07-materials passing. Aggregate P1/P2/P3 blocked
  (bukti domain lengkap; sertifikasi menunggu keputusan pengguna).
- Plan: docs/plans/issues-03-07.md; kontrak docs/api.md.
- Latest progress: harness/progress/2026-09-19-issue-08-cash-sales.md (menutup
  sisa AC #6 lewat #8). Evidence lama per issue tetap pada file 2026-09-19-*.
- Handoff lanjutan: harness/handoffs/issue-08-cash-sales.md (GitHub #8/P4).

## Verified Now

Sisa AC #6 terbukti pada #8 (PostgreSQL nyata terisolasi): harga historis
snapshot tidak berubah setelah reprice katalog; karyawan tidak bisa mengubah
harga/ketersediaan lewat payload penjualan (400); retry identik satu efek;
rollback atomik; batas hari WIB dan izin objek transaksi teruji.
`npm run test:api` exit 0; `npm run verify` exit 0. Semua tests #3–#8 lulus.
GitHub #3/#4/#5/#7 closed dengan bukti lokal/belum push; #6/#8 masih OPEN.

## Changed

Sejak closeout sebelumnya: SalesModule + migration 0005_sales, trigger
`receipt_matches_total`, `IdentityService.write(…, roles)`, OpenAPI/docs/api.md
Penjualan tunai, tracker issue-06 → passing, p4-cash-sales blocked-dengan-
evidence, p3/p2 blocked_reason diperbarui.

## Broken Or Unverified

- Aggregate P1/P2/P3 tidak passing; keputusan pengguna diperlukan untuk
  sertifikasi agregat (bukti domain P1–P4 kini lengkap).
- npm audit: 9 advisory (Prisma/mau). Native Argon2 Node 26 experimental.
- .env pengguna tidak diubah; jangan log/commit secret.
- Diff gate --base belum dapat dijalankan tanpa commit base/HEAD.

## Next Best Step

Manager putuskan agregat P1–P3, lalu lanjut P5 (QRIS/bukti privat) atau P7.
Jangan bypass invariant; runtime localhost/LAN data uji saja.

## Commands

```bash
npm run test:api
npm run verify
npm run harness:index
npm run harness:check
```

Tidak commit/push/deploy. Graph perlu regenerasi setelah perubahan source.
