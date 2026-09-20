# 2026-09-20 — p5-p7-review-fixes

Branch aggregate-certification; lanjut review setelah integrasi paralel P5/P6/P7.

## Completed / evidence

`npm run test:api` exit0 PostgreSQL nyata setelah:
- Replay hasil sale/upload/confirm memeriksa scope terkini sebelum mengembalikan
  data; employee tidak bisa mengambil sale kemarin melalui idempotency.
- GET stok/pembelian/pengeluaran admin-only; material catalog tidak memuat stock.
- JPEG/PNG/WebP decode/re-encode sharp0.35.4 (dependency dipin; Node26 kompatibel),
  maksimum20MP dan5MiB, gambar animasi ditolak; metadata tidak disalin. Red JPEG
  kosong empat byte sebelumnya200 kini400. Fixture valid2x2, download dapat didecode,
  exif/xmp dan marker privat tidak ada. Audit fault upload menjaga bukti lama.
- Cancel lunas tanpa penjelasan settlement sebelumnya200 kini400; settlement
  disimpan/ditampilkan, bukan refund fiktif. Koreksi QRIS wajib foto lama atau
  evidenceUnavailableReason + merchantRef; exception reason tersimpan di Receipt.
- Refund dengan occurredAt default tidak lagi memakai waktu berubah pada
  fingerprint retry. Replay sesudah clock+1detik identik; mixed refund/correction
  race200+409. Backfill wajib occurredBy dan timestamp eksplisit zona waktu.
- Receipt.confirmedAt dipisahkan dari receivedAt; uji tanggal penerimaan
  2026-09-26T17:00Z dan konfirmasi clock hari lain tidak saling menimpa.
- Alasan koreksi Purchase/Expense kini tersimpan pada row, termasuk koreksi
  tanpa delta stok. Migration0010 additive; data lama tidak direkayasa alasannya.

Compose fresh dengan source/config/lockfile tanpa env/node_modules/dist/generated:
`up --build -d --wait` exit0, 10 migration diterapkan. Dockerfile membuat uploads
milik node sebelum mount volume baru. Bootstrap stdin/login/product/QRIS/upload PNG
nyata lewat HTTP200; restart app+DB mempertahankan token, sale dan byte foto yang
bisa didecode. Bind127.0.0.1:3111, DB privat. `down` tanpa-v exit0; volume uji tetap.
Context pointer `/tmp/esteh-review-compose-path`; secret temporary tidak diindeks.

## Acceptance / batas

P5/P6/P7 dinilai melalui AC canonical pada operasi yang tersedia; bukti baseline
progress masing-masing ditambah regression di atas. P8 reporting/P9 beban/handoff
belum dikerjakan. Tidak ada klaim produksi; advisory dependency tetap perlu review.
Tidak commit/push/deploy; histori progress lama tetap utuh.
