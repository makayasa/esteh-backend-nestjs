# 2026-09-20 — local Docker preview

Branch main, HEAD77661fc (PR34 merged sebelum sesi). Pengguna meminta aplikasi
Docker berjalan untuk mencoba API/Swagger. Tidak mengubah kode aplikasi.

## Completed / verification

Docker Engine29.8.0 tersedia, tidak ada container running awal. .env ada dengan
HOST127.0.0.1/PORT3000/DB config; SESSION_SECRET belum terisi. Tambahkan secret
acak32byte hex, tidak dicetak dan .env chmod600; DB config lama dipertahankan.

`docker compose up --build -d --wait --wait-timeout 120` exit0; volume baru
esteh_db-data/esteh_uploads, app+db healthy. App127.0.0.1:3000, DB tidak dipublikasikan.
`curl http://127.0.0.1:3000/health` HTTP200 statusok/databaseup.

CLI bootstrap stdin membuat akun uji localadmin dengan password acak (tidak ada
akun lama di DB baru). Login HTTP200, token dan kredensial hanya file gitignored
.tmp/local-access.json mode600; tidak ditulis ke evidence/log. GET/docs,
/docs/swagger-ui.css,/docs/openapi.json Bearer admin200; tanpa token/docs401.
`npm run verify` exit0 (13tooling,1unit,2e2e,build/lint/harness).

## Batas/next

Halaman Swagger/aset membutuhkan header Bearer; browser navigasi biasa401.
Untuk preview browser, gunakan header modifier hanya scope tepat
http://127.0.0.1:3000, bukan wildcard. Token expired: login ulang memakai akun
lokal dari file private. Tidak membuka Swagger publik atau menonaktifkan guard.
Runtime sengaja dibiarkan running untuk pengguna. Stop via docker compose down
TANPA -v; volume menyimpan akun/data uji. Tidak commit/push/deploy publik.
