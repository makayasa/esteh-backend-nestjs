# 2026-09-19 — issue-09-view-sales

Branch issue-09-view-sales; GitHub #9 (label p4), blocked-by #8.

## Completed

Kolom `Sale.recordedAt` (migration 0006_sale_recorded_at, backfill = occurredAt
untuk data lama) sehingga detail respons membedakan waktu kejadian
(`occurredAt`) dari waktu/pelaku input (`recordedAt`/`recordedBy`, Q12).
Endpoint list/detail dari #8 sudah memenuhi izin: admin semua, karyawan
transaksi sendiri pada hari WIB berjalan, akses lintas-petugas 404. Tambahan
uji pergantian hari WIB dengan waktu terkendali. docs/api.md diperbarui.

## Verification / evidence

- Red: tidak ada — perilaku inti sudah ada dari #8; slice ini menambah field
  `recordedAt` dan uji boundary baru (assertion gagal sebelum field ditambahkan
  karena properti tidak ada pada respons).
- `npm run test:api` exit 0, blok baru "PASS view sales: input time
  distinction, WIB midnight boundary": `recordedAt` == `occurredAt` pada
  penjualan normal dengan `recordedBy` = petugas; penjualan pada 23:59:59 WIB
  terlihat oleh karyawan pada hari yang sama; tepat setelah 00:00:01 WIB
  hilang dari list dan detail karyawan (404) tanpa mengubah data; admin tetap
  melihat 3 penjualan lintas hari/petugas; list berpaginasi 50/halaman.
- `npm run verify` exit 0 (harness check/lint/test, build, lint, 1 unit,
  2 e2e).

## Broken or unverified

- Input susulan admin (waktu kejadian ≠ waktu input) adalah P6; `recordedAt`
  baru terbukti bernilai sama dengan `occurredAt` pada penjualan normal.
- Tracker `passing` tertahan dependensi p4-cash-sales (agregat P1/P2/P3,
  keputusan pengguna) — situasi sama dengan issue-06 sebelum putusan.
- Filter daftar menurut rentang tanggal (laporan) adalah P8, bukan bagian #9.

## Next

Keputusan agregat P1–P3, lalu p4-cash-sales dan tracker ini bisa dinilai
`passing`. Lanjut P5 (QRIS/bukti privat) atau P7.

## Working tree / commits

Commit di branch issue-09-view-sales (di-push; PR dibuat atas permintaan
pengguna). Tanpa deploy; data uji saja.
