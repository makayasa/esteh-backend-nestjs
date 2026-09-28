# 2026-09-20 — Swagger local preview

Branch main. Pengguna eksplisit meminta melepas login Swagger untuk mencoba lokal;
ini pengecualian preview, bukan perubahan role endpoint bisnis/public deployment.
Perubahan milik sesi sebelumnya (progress/handoff preview Docker) dipertahankan.

## Completed / verification

SWAGGER_PUBLIC=true membuka docs/page/assets/spec; default unset/false tetap admin.
.env.example default false, README/docs/api menjelaskan opt-in dan batas localhost.
.env runtime ditambah true hanya setelah HOST127.0.0.1 diperiksa; secret lama utuh.

Red npm run test:e2e: expected200 got401 untuk preview. Green npm run verify exit0,
13tooling/1unit/6e2e; test HTTP dua mode memastikan docs/assets/spec200 atau401,
/auth/me dan /sales tetap401. test:api memaksa SWAGGER_PUBLIC=false agar tidak
mewarisi opt-in host; npm run test:api PostgreSQL nyata exit0 seluruh suite.

Docker compose up --build -d --wait exit0, app/db healthy; live GET/docs,
/docs/swagger-ui.css,/docs/openapi.json tanpa token200, /sales dan /auth/me401.
Port tetap127.0.0.1:3000, DB tidak dipublikasikan. Volume/akun tidak dihapus.

## Batas / next

Swagger terbuka memperlihatkan kontrak API; hanya data uji dan localhost, jangan
aktifkan di internet. Authorize masih diperlukan untuk endpoint bisnis; akun/token
preview sebelumnya tersedia pada .tmp/local-access.json privat/gitignored.
Untuk memulihkan: SWAGGER_PUBLIC=false lalu docker compose up -d --wait.
Tidak commit/push/deploy publik; runtime sengaja dibiarkan running.
