# 2026-09-19 — issue-04-session

Branch main; feature issue-04-session / GitHub #4.

## Completed

Session idle 12 jam, absolut 7 hari (>= boundary), aktivitas hanya memperpanjang
idle. Logout mencabut session dan audit dalam transaksi yang sama. Replay login
memeriksa expired/revoked; retry logout dengan token revoked tetap 401.

## Verification / evidence

Red `node scripts/test-api.mjs`: idle 12h masih HTTP 200, expected 401.
Green `npm run test:api` exit 0: HTTP memakai Clock DI terkendali, PostgreSQL nyata;
idle tepat 12h 401; request tiap jam sampai jam 167 tetap 200, tepat jam 168 401;
logout 200 lalu logout/me/replay login lama 401. Semua checks #3 tetap lulus.
Tidak menggunakan sleep untuk menguji expiry. Test server app ditutup sesudah test.

## Broken or unverified

Pengelolaan akun #5 serta katalog #6/#7 belum selesai. Rate limit/secret runtime
mengikuti #3. npm audit advisories lama belum diperbaiki. Bukan siap produksi.

## Next

Issue #5: admin mengelola akun, reset/nonaktif mencabut seluruh session; audit,
concurrent retry, konflik dan rollback PostgreSQL nyata. Full verify akhir sesi.

## Working tree / commits

Tanpa commit/push/deploy; file tetap lokal. Progress sebelumnya tidak diubah.
