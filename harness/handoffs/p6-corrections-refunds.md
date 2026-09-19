# Handoff — p6-corrections-refunds (P6)

- Branch: p6-corrections-refunds (commit lokal, belum push)
- Feature: p6-corrections-refunds — status `in_progress` dengan branch aktual
- Plan: docs/plans/mvp-implementation-plan.md#p6--koreksi-pembatalan-refund-dan-input-susulan
- Keputusan: Q11/Q12/Q20/Q21/Q23/Q25/Q36 pada docs/plans/mvp-decisions.md;
  kontrak docs/api.md bagian "Koreksi, pembatalan, refund, input susulan".
- Latest progress: harness/progress/2026-09-19-p6-corrections-refunds.md

## Verified Now

`npm run test:api` exit 0 di PostgreSQL nyata terisolasi. AC P6 terpenuhi:
input susulan kemarin oleh admin mempertahankan waktu kejadian, petugas,
referensi manual, harga historis (retry idempoten, payload asing 400);
koreksi 10000→5000 menjadi penerimaan efektif 5000 tanpa refund fiktif
dengan riwayat 10000 tetap terbaca; koreksi total sama tidak menambah
penerimaan efektif; koreksi ke QRIS wajib merchantRef (tersimpan);
pembatalan pending tanpa refund, pembatalan lunas tidak menyembunyikan
penerimaan; refund penuh sekali (parsial/pending/ganda/koreksi-setelah-
refund ditolak); trigger DB menolak refund ≠ penerimaan; dua refund dan
dua koreksi konkuren hanya satu efek; kegagalan audit membatalkan koreksi.
`harness:lint`, `harness:test` (13/13), build, lint, unit, e2e hijau.

## Changed

- Migration `prisma/migrations/0009_corrections_refunds` + schema: koreksi
  self-relation, occurredBy/manualRef/reason, cancel fields, tabel Refund +
  trigger refund_matches_receipt.
- `src/sales/`: backfill/correct/cancel/refund + OpenAPI; status
  `cancelled`; confirm/upload ditolak untuk penjualan batal.
- `docs/api.md`, `scripts/test-api.mjs` blok P6 (+ re-login karena lompatan
  waktu uji melewati idle 12 jam).

## Broken Or Unverified

- `npm run harness:check` GAGAL: rantai dependensi (p4 blocked, p5/p7
  in_progress) menunggu keputusan agregat P1–P3 pengguna — bukan regresi.
- Asumsi desain tercatat: cancel lunas tidak menuntut refund dulu; metode
  refund bebas teks; QRIS→QRIS koreksi wajib merchantRef.
- Laporan efektif adalah bagian P8; belum diuji sebagai endpoint.

## Next Best Step

Manager putuskan agregat P1–P3 agar rantai tracker bisa `passing` dan gate
hijau penuh; setelah itu nilai p6 `passing` dengan evidence progress ini dan
tutup issue P6; lanjut P8.

## Commands

```bash
npm run test:api   # butuh Docker
npm run verify     # gagal hanya di harness:check (rantai dependensi)
npm run harness:index
```

Tidak push/PR/deploy; worktree P7 tidak disentuh.