# 2026-09-19 — issue-08-cash-sales

Branch main; feature p4-cash-sales, GitHub #8. Keputusan pengguna sesi ini:
kerjakan #8 untuk menutup sisa AC #6 (harga historis, payload penjualan).

## Completed

SalesModule/Service/Controller + migration 0005_sales (Sale, SaleItem, Receipt
dengan CHECK rupiah/quantity dan trigger `receipt_matches_total`: nominal
penerimaan wajib sama dengan sum unitPrice × quantity, termasuk pada UPDATE).
`IdentityService.write` menerima daftar roles (default `['admin']`) sehingga
karyawan dapat menulis `sale.create` dengan audit/idempotency/transaksi yang
sama. `POST /sales` menerima hanya `items[{productId, quantity}]`; harga
snapshot dari katalog, total backend, satu penerimaan tunai, occurredAt dari
server. `GET /sales` + `GET /sales/:id`: admin semua; karyawan transaksi sendiri
pada hari WIB berjalan (Q22), akses di luar scope 404. OpenAPI `/sales` +
docs/api.md. Tanpa field uang diserahkan/kembalian (Q19).

## Verification / evidence

- `npm run test:api` exit 0, tambahan PASS "cash sales total/snapshot/
  idempotency/rollback/permissions/WIB scope": 2×Rp5.000 → satu penerimaan
  Rp10.000; payload forged (total/occurredAt/unitPrice/quantity 0/produk
  unavailable) 400; reprice katalog 5000→6500 tidak mengubah snapshot dan
  penerimaan 10000; 3 retry konkuren key sama = respons sama, Sale=1
  Receipt=1; payload berbeda key sama 409; UPDATE/INSERT Receipt melanggar
  trigger ditolak DB; fault trigger audit → rollback Sale/SaleItem/Receipt
  (count sebelum=sudah); karyawan tidak melihat transaksi admin (detail 404);
  pergeseran occurredAt ke hari WIB sebelumnya mengeluarkan transaksi dari
  list/detail karyawan, admin tetap melihat.
- `npm run verify` exit 0: harness check/lint/test, build, lint, 1 unit,
  2 e2e.
- Tabel invariant diuji pada PostgreSQL nyata terisolasi (container test).

## Broken or unverified

- AC "pencatatan tunai tidak mengurangi bahan otomatis" terpenuhi secara
  struktural (tidak ada jalur konsumsi bahan sama sekali; ledger stok adalah
  P7), bukan lewat uji negatif khusus.
- QRIS/pending (P5), input susulan admin dengan waktu kejadian asli (P6),
  koreksi/refund, dan pelaporan (P8) belum ada; skema Receipt CHECK method
  'cash' akan diperluas P5.
- Tracker p4-cash-sales tidak bisa `passing` karena depends_on p3-catalog
  masih blocked (agregat P1/P2 menunggu keputusan pengguna; P1 menyebut batas
  upload P5). Fungsional AC #8 terbukti; sertifikasi agregat bukan keputusan
  worker.
- npm audit advisory Prisma/mau tetap seperti closeout sebelumnya.

## Next

Manager putuskan agregat P1–P3 (bukti domain sudah ada). Setelah itu p4 bisa
dinilai `passing`. Lanjut P5 (QRIS/bukti privat) atau P7 paralel sesuai plan.
Graph perlu regenerasi setelah perubahan source.

## Working tree / commits

Tanpa commit/push/deploy; seluruh perubahan lokal untracked seperti sebelumnya.
