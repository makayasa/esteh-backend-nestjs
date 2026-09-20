# 2026-09-20 — P8 laporan JSON (#26–#28)

Branch aggregate-certification. Implementasi satu fitur P8, sesudah P6/P7 review.

## Completed

ReportingModule tiga GET admin-only: /reports/sales, /payments, /costs.
from/to kalender inklusif WIB, maksimal366hari, page50. Satu statement SQL per
laporan memberikan snapshot konsisten untuk count/agregat/page. Revisi efektif
via correctedById null; refund bukan pengeluaran dan tidak menghapus bruto.
Waktu penerimaan terpisah dari konfirmasi; pending terpisah dari nilai lunas.
Kontrak/metrik/schema request/query/error di OpenAPI dan docs/api.md.

## Verification / evidence

Red per slice: /reports/sales404, /reports/payments404, /reports/costs404.
Green `npm run test:api` exit0 setelah masing-masing implementasi; final seluruh
P0–P8 lulus PostgreSQL17 nyata terisolasi, termasuk:
- Penjualan Senin05Jan2026 23:59:59WIB senilai10000, dana diterima Selasa
  00:00WIB, konfirmasi waktu server berbeda: bruto Senin10000, receipt Senin0,
  receipt QRIS Selasa10000. Refund Selasa10000 tidak menghapus bruto Senin.
- Pending QRIS terpisah/count1, tidak menambah bruto. Koreksi sale10000→5000
  memperbarui Senin satu kali; total15000/count2 termasuk fixture sebelumnya,
  receipt tunai efektif5000, bukan10000+5000.
- Purchase50000→45000 dan Expense5000→4000 tetap pada periode asli;
  costs45000/4000, masing-masing satu revisi, reason tersimpan. Refund tidak masuk.
- Employee403 untuk ketiga laporan; tanggal30Feb/reversed range400; page2 kosong
  pada dataset kecil tanpa mengubah agregat, page metadata benar.
- OpenAPI route P7/upload memiliki body schema; sales.method opsional dan confirm
  body{} sah; protected spec admin200/employee403/anonymous401; oversized JSON413.

## Batas

Tidak CSV/PDF/UI/laba/saldo kas. Laporan bruto mengecualikan sale batal; penerimaan
tetap memuat uang sale batal sampai refund tercatat terpisah. Query belum diukur
pada dataset produksi besar; nominal agregat JSON number untuk profil MVP uji.
P9 load/handoff dicatat progress terpisah, bukan klaim produksi.

## Working tree

Tanpa commit/push/deploy. DB dan foto hanya fixture sintetis. Graph regenerate
allowlist38file,267nodes/480edges,69 raw unresolved AST edges diungkap; source audit
lulus. Tidak mengindeks .env/foto/DB/data transaksi.
