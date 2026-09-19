# 2026-09-19 — p5-qris-evidence (P5, GitHub #10/#11/#12)

- Branch: p5-qris-evidence (dari main)
- Feature: p5-qris-evidence
- Goal / scope: penjualan QRIS pending, unggah/baca bukti privat, konfirmasi
  manual dengan pengecualian admin (Q10, Q26, Q27, Q31).

## Completed

- `prisma/migrations/0007_qris_evidence/migration.sql`: Sale.method
  ('cash'|'qris') + kolom bukti (evidencePath/Mime/Size/At/By, CHECK size
  1..5 MB), Receipt.method CHECK diperluas ke 'qris', kolom merchantRef +
  confirmReason (Q26). `prisma/schema.prisma` mengikuti.
- `src/files/store.ts`: validasi isi JPEG/PNG/WebP (magic byte + struktur,
  tanpa dependensi baru), pembuangan metadata lokasi (JPEG APP1..APPn, PNG
  eXIf/tEXt/iTXt/zTXt, WebP EXIF), penyimpanan privat di volume
  (`EVIDENCE_DIR`, default `uploads`, cocok volume Compose /app/uploads);
  tulis file temp + rename sebelum referensi DB (plan item 15).
- `src/sales/`: create menerima `method` opsional — QRIS tanpa penerimaan
  (status pending, receipt null); `POST /sales/:id/evidence` (upload bukti,
  idempoten via hash sha256 payload), `GET /sales/:id/evidence` (unduh
  berizin transaksi, 404 di luar scope), `POST /sales/:id/confirm`
  (karyawan wajib bukti; admin tanpa bukti wajib reason + merchantRef yang
  tersimpan di Receipt; lock FOR UPDATE baris sale untuk konkurensi).
- `src/identity/identity.service.ts`: action write menerima account (role)
  sebagai parameter ketiga — tanpa perubahan perilaku pemanggil lama.
- `src/http.ts`: express.raw untuk image/* limit 5 MB (413 bila lebih) +
  OpenAPI body `/sales` (method) dan `/sales/{id}/confirm`.
- `docs/api.md` bagian "QRIS dan bukti privat (#10–#12)"; `.env.example`
  EVIDENCE_DIR; `.gitignore` /uploads.

## Verification / evidence

| Command / check | Result / exit code | Scope |
| --- | --- | --- |
| `npm run test:api` | exit 0, PASS QRIS pending/evidence privacy/sanitization/confirm/exception/race + PASS evidence persists across process restart | PostgreSQL nyata terisolasi: qris pending tanpa Receipt; retry create idempoten (1 sale); user lain 404 pada evidence/confirm; karyawan tanpa foto 400; admin tanpa alasan/referensi 400; admin dengan alasan+referensi lunas, reason/merchantRef tersimpan di Receipt; upload ke cash 400; file bukan gambar/mime salah 400; >5 MB 413; chmod dir read-only → 500 tanpa evidencePath di DB lalu retry key sama sukses; upload retry identik tanpa efek ganda; metadata GPS/Exif dibuang (byte unduhan == versi bersih, ketiga format); upload saja tidak melunasi; konfirmasi karyawan dengan foto lunas; dua konfirmasi konkuren key berbeda = 200+409, satu Receipt; bukti & status tetap ada setelah restart proses server |
| `npm run harness:lint`, `npm run harness:test` | exit 0 (13/13 test tooling) | tooling |
| `npm run build`, `npm run lint`, `npm test`, `npm run test:e2e` | exit 0 | build + 1 unit + 2 e2e |
| `npm run harness:check` | GAGAL dengan satu temuan: p5-qris-evidence dependency p4-cash-sales belum passing | lihat Broken or unverified |

## Broken or unverified

- `npm run verify` gagal di gerbang pertama (`harness:check`) karena validator
  menuntut dependensi p4-cash-sales `passing`; p4 masih `blocked` menunggu
  keputusan pengguna atas agregat P1/P2/P3. Fungsionalitas P4 sendiri terbukti
  pada PostgreSQL nyata (progress issue-08). Asumsi (arah pengguna sesi ini):
  P5 dikerjakan sekarang tanpa mengubah keputusan scope/bisnis; status
  tracker p5 tetap `in_progress` sesuai instruksi, sehingga gate check gagal
  secara eksplisit sampai agregat diputus dan p4 bisa dinilai `passing`.
- Penguji file fault hanya mensimulasikan kegagalan tulis via chmod direktori
  (EACCES); skenario disk penuh / ENOSPC tidak diuji.
- Metadata lokasi: JPEG APPn, PNG text/eXIf, WebP EXIF dibuang; EXIF nested
  pada Makernote tidak diparsing ulang (ponytail: batas = pembuangan segmen/
  chunk metadata standar; upgrade ke re-encode gambar bila dibutuhkan).
- Upload ulang bukti (format berbeda) menimpa referensi; file lama menjadi
  orphan — sejalan plan item 15, pembersihan orphan belum dibuat.
- npm audit: 9 advisory (Prisma/mau) seperti baseline; tanpa perubahan.
- Tidak menyentuh worktree P7; tidak push/PR/deploy.

## Next

Manager putuskan status agregat P1–P3 agar p4-cash-sales (lalu p5) dapat
dinilai `passing` dan gate `harness:check` hijau penuh; setelah itu GitHub
#10/#11/#12 bisa ditutup dengan bukti.

## Working tree / commits

Commit lokal di branch p5-qris-evidence (belum push). Tidak ada perubahan
tersisa setelah commit.