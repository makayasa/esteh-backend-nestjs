# 2026-09-19 — issue-05-accounts

Branch main, feature issue-05-accounts / GitHub #5.

## Completed

IdentityModule menyembunyikan transaksi/audit/idempotency dan akun. Controller
memanggil operasi service, tidak merangkai mutasi DB. Admin membuat akun individual
admin/employee, daftar pagination, reset password dan nonaktif. Karyawan ditolak.
Reset/nonaktif lock row target serta revoke semua session dalam transaksi.
Write key scoped pelaku/operasi, fingerprint HMAC (password tidak disimpan mentah),
role/active session diperiksa sebelum replay. Tidak ada endpoint hapus akun.

## Verification / evidence

Red `node scripts/test-api.mjs`: POST /accounts 404, expected 200.
Green `npm run test:api`: exit 0 terhadap PostgreSQL fresh; akun dibuat/login,
karyawan 403, daftar dua akun; 3 concurrent replay hasil identik, payload beda 409;
reset mencabut dua token, login password baru berhasil, nonaktif mencabut token baru.
Trigger exception pada audit insert membuat create akun HTTP 500 dan count
Account/Audit/Idempotency seluruhnya tidak berubah. Audit/result idempotency tidak
mengandung password lama/baru. Seluruh checks #3/#4 tetap lulus. Lint exit 0.

## Broken or unverified

Katalog #6/#7 belum dibuat. Tidak mengklaim P2 lengkap untuk hak akses transaksi
hari WIB karena endpoint transaksi belum ada. Risiko dependency audit mengikuti #3.
Diff gate menunggu commit base. Full verify/smoke Compose akhir sesi masih wajib.

## Next

Issue #6 Produk Jual, lalu #7 Bahan Baku/Kemasan; tidak membuat domain penjualan/stok
untuk test riwayat sebelum tiketnya. Review guardrail dan jalankan gates final.

## Working tree / commits

Tidak commit/push/deploy. Container uji dibersihkan oleh runner; .env lama tetap utuh.
