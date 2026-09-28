# 2026-09-20 — Postman collection

Branch main, HEAD77661fc; perubahan preview Swagger/Docker milik pengguna tetap.
Pengguna meminta Postman collection siap impor. Tidak ada commit/push/deploy.

## Completed

`scripts/make-postman.mjs` (`npm run postman`) membaca OpenAPI stack yang hidup
(default 127.0.0.1:3000) dan menghasilkan:
- postman/esteh.postman_collection.json — 40 request, tanpa secret; generator
  menolak output bila ada path spec yang belum tercakup.
- postman/esteh-local.postman_environment.example.json — template publik.
- .tmp/esteh-local.postman_environment.json — privat gitignored, password/token
  localadmin dari .tmp/local-access.json, chmod600; tidak dimasukkan Git/evidence.

Alur collection: Setup(health/login/me/logout), Akun, Katalog, Penjualan&QRIS
(termasuk upload bukti body file + download), Koreksi&Refund, Stok&Pembelian,
Laporan. Bearer auth koleksi memakai {{accessToken}}; login test menyimpan token;
create product/material/sale/backfill/purchase/expense menyimpan ID ke environment
untuk request berikutnya; Idempotency-Key per-send unik dengan opsi
fixedIdempotencyKey untuk uji retry identik (dokumentasi di deskripsi koleksi).
docker-compose.yml perubahan pengguna (DB loopback 5433) dipertahankan.

## Verification / evidence

- Generator dijalankan dua kali: 40 request, coverage assertion lulus.
- `git check-ignore` lulus untuk environment lokal.
- Smoke chain HTTP nyata pada stack berjalan: health200, login200 (token baru),
  product200, sale200 total10000, list200 — urutan variable test script valid.
- npm run verify exit0 (17 tracker, tooling13/13, build/lint, unit1/1, e2e6/6);
  e2e mencakup dua mode SWAGGER_PUBLIC.

## Batas / next

Environment lokal berisi secret uji; sekali lagi jangan diekspor/dibagikan.
Retry identik: isi fixedIdempotencyKey lalu kirim request sama dua kali.
Upload bukti butuh memilih file foto di tab Body (Postman desktop).
Tidak commit/push/deploy publik; stack dibiarkan running untuk pengguna.
