# 2026-09-19 — issue-06-products

Branch main; feature issue-06-products, GitHub #6.

## Completed

CatalogModule/Service, Product migration dengan CHECK rupiah integer 1..1_000_000_000.
Admin create/update/nonaktif, employee read-only, pagination 50 item, unknown fields
rejected. Identitas/transaksi/audit/idempotency dipakai pada write; tidak ada delete.

## Verification / evidence

Red `node scripts/test-api.mjs`: POST /products 404.
Green `npm run test:api` exit 0: Regular 5000/available, Jumbo 8000/unavailable,
ID berbeda; harga pecahan 400; employee write 403/read 200; page 0 ditolak;
update harga 6000, nonaktif tetap ada pada daftar. Semua tests #3–#5 lulus.

## Broken or unverified

Acceptance harga historis pada transaksi dan penolakan manipulasi payload penjualan
belum terbukti karena domain penjualan (#8) belum ada. Tidak membuat transaksi palsu
atau klaim immutable history berdasarkan master saja. Issue #6 tetap OPEN dan
tracker blocked untuk acceptance lintas-domain ini; implementasi master lokal ada.

## Next

Lanjut #7 (depends #5, bukan #6). Saat #8 tersedia, buktikan harga backend dan
snapshot tidak berubah setelah master diubah; baru tutup #6 jika seluruh AC lulus.

## Working tree / commits

Tanpa commit/push/deploy; file source/migration/test lokal belum commit.
