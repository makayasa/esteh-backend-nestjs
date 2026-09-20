# Handoff — aggregate-certification

- Branch `aggregate-certification`, baseline committed `1f309a4`.
- P0–P9 tracker passing setelah review/perbaikan dan evidence baru.
- Progress: `2026-09-19-aggregate-review.md`, `2026-09-20-p5-p7-review-fixes.md`,
  `2026-09-20-p8-reporting.md`, `2026-09-20-p9-load-handoff.md` di harness/progress/.
- Source canonical docs/plans/mvp-implementation-plan.md; kontrak docs/api.md.

## Verified Now

`npm run verify` exit0:17 tracker, tooling13/13, build/lint, unit1/1, e2e2/2.
`npm run test:api` exit0 seluruh CLI/HTTP/PostgreSQL/photo/waktu terkendali P0–P8.
`npm run test:load` exit0:1000sales,10users,0error, p50=21/p95=28/p99=32ms;
1000receipt=6500000,refund race1efek,stock race5sukses/5ditolak,saldo0,ledger0mismatch.
Final Compose image build/start healthy,10migration replay aman; foto/DB tetap
setelah restart dan down/up rebuild, DB-down503/recovery, localhost3111/DB privat.
Graph38files267nodes480edges, source audit lulus;69 unresolved raw AST edges diungkap.
`harness:index`, `harness:check` dan `harness:check -- --base 58cd9f0` exit0.
`git diff --check` exit0. Diff gate hanya committed history, bukan perubahan lokal.

## Changed

- Replay sale/upload/confirm memeriksa izin objek/hari terkini sebelum replay.
- GET stok/purchase/expense admin-only; katalog tidak membocorkan saldo.
- Sharp0.35.4 decode/re-encode gambar valid,20MP/5MiB, metadata dibuang;
  file unik menjaga foto lama saat rollback; Docker volume uploads milik node.
- Migration0010: settlement cancel, confirmedAt, alasan koreksi purchase/expense.
  QRIS correction memerlukan bukti/pengecualian; refund default-time retry stabil.
- P8 ReportingModule tiga laporan admin JSON WIB/revisi efektif.
- P9 load runner, OpenAPI P7/upload/optional fields/error, README/API/mobile docs.

## Broken Or Unverified

Tidak ada acceptance lokal yang masih ditandai gagal. Bukan produksi:9 advisory
npm baseline belum dibereskan, Argon2 experimental, warning pg9/resolver Vitest
non-fatal. HTTPS/backup eksternal/restore target/notifikasi serta mobile nyata belum
terverifikasi, sesuai backlog Q33–Q39. Graph bukan dependency map lengkap.
Data migrasi lama tidak bisa merekonstruksi alasan/waktu konfirmasi yang dulu
hilang. Gunakan fixture/data uji, bukan transaksi nyata melalui HTTP.

## Next Best Step

Pengguna meminta PR pada20September2026; publikasi branch aggregate-certification
ke main diotorisasi. Base remote fe4d7c5, sehingga PR juga mencakup commit P6
1f309a4 selain perbaikan/P8/P9. Review PR berikutnya; jangan merge/deploy otomatis.
Progress publikasi: harness/progress/2026-09-20-aggregate-pr.md.
Sebelum produksi: audit dependency, TLS, backup/restore dan uji mobile aktual.

## Commands

```bash
npm run verify
npm run test:api
npm run test:load
uv tool run --from graphifyy==0.9.1 python scripts/build-graph.py
npm run harness:index
npm run harness:check
npm run harness:check -- --base 58cd9f0
```

Commit/push branch dan PR diotorisasi pengguna; tidak merge/deploy.
Test ephemeral dibersihkan; Compose verification down
menyisakan volume sintetis. Context pointer `/tmp/esteh-review-compose-path`;
.env pengguna dan service project lain tidak disentuh.
