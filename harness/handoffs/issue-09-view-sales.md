# Handoff — issue-09-view-sales (GitHub #9 / P4)

- Branch issue-09-view-sales: PR #31 di-merge pengguna ke main (2e121d3);
  tracker/index/handoff diperbarui pasca-merge.
- Status blocked: seluruh AC terbukti, `passing` tertahan dependensi
  p4-cash-sales (agregat P1/P2/P3, keputusan pengguna).
- Plan: docs/plans/mvp-implementation-plan.md#p4--penjualan-tunai-end-to-end;
  kontrak docs/api.md.
- Latest progress: harness/progress/2026-09-19-issue-09-view-sales.md.

## Verified Now

`npm run test:api` exit 0 dengan blok "PASS view sales: input time
distinction, WIB midnight boundary": admin melihat semua penjualan lintas
petugas/hari; karyawan hanya milik sendiri pada hari berjalan; akses
lintas-petugas dan lintas-hari 404 tanpa membocorkan keberadaan resource;
`recordedAt`/`recordedBy` terpisah dari `occurredAt` (Q12); pergantian hari
WIB dengan waktu terkendali: 23:59:59 WIB terlihat, 00:00:01 WIB hilang dari
akses karyawan; list berpaginasi 50/halaman. `npm run verify` exit 0.

## Changed

prisma/schema.prisma + migration 0006_sale_recorded_at (`Sale.recordedAt`,
backfill occurredAt), src/sales/sales.service.ts (recordedAt pada create dan
respons), docs/api.md, tracker issue-09-view-sales baru, progress baru.

## Broken Or Unverified

- Input susulan admin (waktu kejadian ≠ waktu input) P6; recordedAt belum
  teruji berbeda dari occurredAt.
- `passing` tertahan agregat P1/P2/P3 (keputusan pengguna).
- npm audit advisory tetap; tanpa secret dalam evidence.

## Next Best Step

Keputusan agregat P1–P3; setelah p4-cash-sales passing, tracker ini mengikuti.
Lanjut P5 atau P7. Review PR dan merge bila disetujui.

## Commands

```bash
npm run test:api
npm run verify
npm run harness:index
npm run harness:check
```

Runtime localhost/LAN data uji saja; tanpa deploy.
