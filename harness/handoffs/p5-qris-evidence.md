# Handoff — p5-qris-evidence (GitHub #10/#11/#12 / P5)

- Branch: p5-qris-evidence (commit lokal, belum push)
- Feature: p5-qris-evidence — status `in_progress` dengan branch aktual
- Plan: docs/plans/mvp-implementation-plan.md#p5--qris-dan-bukti-privat;
  keputusan Q10/Q26/Q27/Q31 pada docs/plans/mvp-decisions.md; kontrak
  docs/api.md bagian "QRIS dan bukti privat (#10–#12)".
- Latest progress: harness/progress/2026-09-19-p5-qris-evidence.md

## Verified Now

`npm run test:api` exit 0 dengan blok P5 pada PostgreSQL nyata terisolasi:
penjualan QRIS pending tanpa penerimaan dan tidak masuk penjualan lunas;
retry create/upload idempoten (payload sha256); user lain 404 pada
evidence/confirm (tidak bisa menebak ID); karyawan tanpa foto ditolak 400;
pengecualian admin tanpa alasan/referensi ditolak 400, dengan keduanya
tercatat di Receipt; file invalid/tipe salah 400, >5 MB 413; kegagalan tulis
(chmod read-only) → 500 tanpa referensi DB lalu retry sukses; metadata
lokasi (JPEG APPn, PNG eXIf/text, WebP EXIF) dibuang — byte unduhan identik
versi bersih; upload saja tidak melunasi; dua konfirmasi konkuren (key
berbeda) = satu 200, satu 409, satu Receipt; bukti dan status tetap ada
setelah restart proses server. `harness:lint`, `harness:test` (13/13),
build, lint, unit (1), e2e (2) exit 0.

## Changed

- Migration `prisma/migrations/0007_qris_evidence` + `prisma/schema.prisma`:
  Sale.method + kolom bukti; Receipt CHECK 'cash'|'qris'; merchantRef/
  confirmReason.
- `src/files/store.ts` (baru): validasi isi + sanitasi metadata + simpan
  privat di `EVIDENCE_DIR` (default `uploads`, volume Compose /app/uploads).
- `src/sales/`: create method opsional (default cash), upload/read evidence,
  confirm dengan lock baris; `src/http.ts` raw parser 5 MB + OpenAPI;
  `src/identity/identity.service.ts` action write menerima account.
- `docs/api.md`, `.env.example`, `.gitignore`.

## Broken Or Unverified

- `npm run harness:check` GAGAL (satu temuan): p5 `in_progress` menuntut
  p4-cash-sales `passing`; p4 masih `blocked` menunggu keputusan agregat
  P1/P2/P3 pengguna. Status p5 sengaja `in_progress` sesuai arah pengguna;
  gate hijau penuh menunggu keputusan tersebut.
- Disk penuh (ENOSPC) tidak diuji; hanya EACCES via chmod. Orphan file saat
  upload ulang tidak dibersihkan (plan item 15 membolehkan).
- Status `passing` belum: seluruh AC fungsional terbukti, tapi tracker
  menuntut dependensi passing + review perilaku.

## Next Best Step

Manager putuskan agregat P1–P3 → p4-cash-sales dinilai `passing` → set
p5 `passing` dengan evidence progress ini, tutup GitHub #10/#11/#12, jalankan
`npm run harness:index` + `npm run harness:check`.

## Commands

```bash
npm run test:api   # butuh Docker
npm run verify     # gagal hanya di harness:check (dependensi p4)
npm run harness:index
```

Tidak push/PR/deploy; worktree P7 tidak disentuh.