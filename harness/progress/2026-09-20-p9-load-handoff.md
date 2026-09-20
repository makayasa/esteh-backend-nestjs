# 2026-09-20 — P9 beban dan handoff (#29/#30)

Branch aggregate-certification, baseline committed 1f309a4. Tidak commit/push/deploy.

## Profil dan hasil beban

`npm run test:load` exit0. Runner menjalankan seluruh acceptance API/CLI/DB dahulu,
lalu10 akun admin sintetis (hak admin diperlukan untuk race refund/stok), masing-
masing100 penjualan HTTP sequential per akun, sepuluh loop berjalan paralel. Total
1000 penjualan dalam satu hari Clock uji; workload dipadatkan, bukan soak24jam.
Semua memakai produk5000/6500 fixture, satu item per request. Setelah itu20 replay,
10 refund konkuren untuk satu sale,10 pengurangan stok berebut5 unit.

Hardware: Apple M1 Pro10CPU, RAM32GiB, macOS arm64, Node26.4.0. Docker Engine29.8.0,
VM10CPU/8319504384bytes RAM, PostgreSQL17 image dipin. App proses host, DB Docker,
HTTP localhost; bukan benchmark home server produksi.

Run akhir:1000sale/10users,0error sale,2366ms total fase beban (termasuk race/replay
sesudah sales), latency POST sales p50=21ms/p95=28ms/p99=32ms. Run sebelumnya
2447ms,p50=21,p95=29,p99=40. Tidak ada target latency produksi yang dijanjikan.

Rekonsiliasi DB:1000 Sale,1000 Receipt, jumlah6500000; ID sale unik1000,20retry
mengembalikan ID asal. Refund race tepat1 HTTP200+9HTTP409 dan satu efek; stok
race5HTTP200+5HTTP400, saldo0, seluruh saldo Material sama dengan jumlah ledger
(0 mismatch). Pagination halaman1/2 masing-masing50 tanpa ID tumpang-tindih.
Expected409/400 bukan error integritas. Seluruh assertion fail-fast; tidak ada skip.

## Handoff integrasi dan runtime

README/docs/api.md dan OpenAPI memuat: login/session/bootstrap, role, retry/key,
nominal, pagination, waktu WIB, error, QRIS upload dua langkah, input susulan,
koreksi/refund/settlement, stok/pembelian/pengeluaran dan tiga laporan JSON.
Request schemas mencakup seluruh POST, termasuk binary image dan P7. Optional
method/receivedAt/reason sesuai operasi (confirm{} sah dengan foto). Dokumen
admin-only; token mobile wajib secure storage, localhost/LAN hanya data uji.

Compose clean build + fresh migration/QRIS upload node-user + restart database/foto
sudah diuji pada progress review. Rebuild image final dari context isolated sama,
`up --build -d --wait` exit0 sesudah stack down: account/sale/foto tetap ada,
OpenAPI reports route tersedia, GET costs200, foto width2 dapat didecode. Stop DB
health503, start recovery healthy, migrate deploy ulang10migration/no pending,
`down` tanpa-v exit0. Port127.0.0.1:3111, DB privat. Volume sintetis dipertahankan.

Graph allowlist source/docs diperbarui:38files,267nodes,480edges.69 raw unresolved
AST edges diungkap; tidak ada missing endpoint/self-loop/collapse. Source audit
lulus, docs heading-only tanpa semantic LLM. Tidak ada secret/foto/DB/transaksi
terindeks. Cara regenerate/query di README; runtime tanpa Graphify.

## Rekonsiliasi acceptance

P0 runtime/persistensi/bind/migration; P1 validation/idempotency/atomicity/kontrak;
P2 identity/revocation/RBAC/WIB; P3 katalog/snapshot/satuan; P4 tunai; P5 evidence
privat/decode/confirm; P6 koreksi/refund/backfill/cancel settlement; P7 stok/ledger/
purchase/expense; P8 laporan tanggal/revisi/metrik seluruhnya diperiksa melalui
source serta suite PostgreSQL nyata. Bukti detail di progress aggregate-review,
p5-p7-review-fixes,p8-reporting dan progress baseline. P9 menggabungkan bukti itu
plus load, runtime ulang, docs dan graph. Sertifikasi terbatas integrasi lokal.

## Risiko yang tetap eksplisit

9 advisory npm baseline Prisma/mau perlu review; tidak downgrade major otomatis.
Argon2 Node experimental; warning pg deprecation concurrency dan resolver Vitest
non-fatal. API belum uji mobile nyata karena frontend terpisah/belum tersedia;
ini tidak memblokir backend lokal menurut P9, wajib sebelum go-live. Belum HTTPS,
backup eksternal, restore RPO/RTO, notifikasi atau kesiapan internet. Tidak ada
retensi/auto-delete bukti; orphan rollback bernama unik, operator pantau kapasitas.
Data lama correction reason/confirmedAt migration tidak bisa merekonstruksi fakta
historis hilang; gunakan data uji baru untuk acceptance, bukan transaksi nyata.

## Gates dan working tree

Full verify/index/check dan diff check final dicatat pada handoff sesudah state
final diperbarui. Diff gate committed tidak membuktikan perubahan belum commit.
Test runner menghapus hanya container ephemeral miliknya; Compose verifikasi down
menjaga volume. Tidak mengubah .env pengguna atau layanan project lain.
