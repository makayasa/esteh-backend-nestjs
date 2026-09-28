# Handoff — local-docker-preview

- Branch main, HEAD77661fc.
- Scope: stack Docker, Swagger preview, dan Postman collection siap pakai.
- Progress terbaru: harness/progress/2026-09-20-postman-collection.md.

## Verified Now

App/db healthy; localhost3000, DB privat. Health200. Swagger page/assets/spec
anonymous200 karena SWAGGER_PUBLIC=true. API /sales,/auth/me tanpa token401.
verify exit0 (6e2e dua mode), test:api PostgreSQL exit0. Postman collection 40
request coverage penuh; smoke chain login/product/sale/list HTTP200 di stack berjalan.

## Changed

SESSION_SECRET acak ditambahkan ke .env lama yang sebelumnya tidak terisi.
DB fresh Compose, bootstrap akun localadmin via stdin. Kredensial/token hanya
.tmp/local-access.json mode600 gitignored; jangan indeks/cetak pada evidence.
SWAGGER_PUBLIC=true preview (dokumen terbuka, API tetap Bearer). scripts/
make-postman.mjs + postman/* ditambahkan; environment privat di .tmp.

## Broken Or Unverified

Browser langsung bisa membuka /docs. SWAGGER_PUBLIC default false di template;
true hanya untuk preview localhost/data uji. API bisnis tetap Bearer. Tidak ada
login UI docs. Keterbatasan produksi tetap berlaku.

## Next Best Step

Pengguna coba API/Swagger. Stack dibiarkan running. Stop tanpa hapus volume saat
selesai; jangan down-v kecuali pengguna meminta penghapusan data.

## Commands

```bash
docker compose ps
curl http://127.0.0.1:3000/health
npm run postman
docker compose down
npm run harness:index
npm run harness:check
```

Tidak commit/push. Bukti tidak mengandung secret.
