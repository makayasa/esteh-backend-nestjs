# Draft tiket MVP Esteh — menunggu persetujuan

Sumber: [plan MVP](mvp-implementation-plan.md), keputusan Q1–Q39, dan glosarium domain.
Tracker: GitHub Issues sesuai `docs/agents/issue-tracker.md`. Belum ada issue
terbuka saat pemeriksaan. Label `ready-for-agent` belum tersedia di GitHub;
lengkapi melalui `/setup-matt-pocock-skills` sebelum publikasi.

Nomor di bawah hanya ID draft, bukan nomor issue GitHub. Tidak ada tiket yang
sudah dipublikasikan atau dinyatakan selesai. Baseline handoff terakhir menyebut
P0 in_progress dan health e2e gagal; sesi planning ini tidak menjalankan ulang
backend atau memverifikasi bahwa kegagalan tersebut masih terjadi.

## Aturan pemecahan

- Satu tiket implementasi mencakup perubahan data/migration, operasi bisnis,
  HTTP, izin, kontrak Swagger, dan tests yang relevan. UI bukan scope backend.
- P1 didistribusikan ke operasi pertama yang membutuhkannya: validation/error
  dan pengujian DB nyata sejak login, waktu terkendali pada session, serta
  audit/transaksi/idempotency pada pengelolaan akun. Bukan tiket horizontal.
- Setiap write bisnis berikutnya mewarisi guardrail tersebut: retry identik
  satu efek; key sama/payload berbeda konflik; otorisasi mendahului replay;
  scope key pelaku+operasi; rollback atomik; secret tidak masuk log.
- Batas angka, tanggal WIB, pagination, request size dan error terdokumentasi
  saat endpoint pertama membutuhkan, lalu dipakai konsisten. Upload menambah
  batas decoding/file. Swagger terlindungi sejak diperkenalkan, bukan P9 saja.
- Setiap tiket membawa bukti acceptance tests dan progress/handoff harness.
  Test concurrency/otorisasi/rollback ditambahkan per operasi; tiket beban
  akhir tidak menjadi alasan menunda regression tests sampai akhir MVP.
- Blocker adalah kebutuhan implementasi nyata, bukan semata urutan P0–P9.
  Pemisahan ini memperinci/resekuensikan plan; belum mengubah plan canonical.
- Tidak perlu prefactor luas berdasarkan state yang sudah diamati. Tiket 01
  merekonsiliasi P0 yang sedang dikerjakan; jangan membangun infrastruktur kedua.
- Graphify tidak memblokir fitur bisnis. Stok dan pengeluaran dapat dikerjakan
  paralel dengan penjualan setelah dependensi masing-masing selesai.

## Usulan tiket


1. **Validasi running lokal dan readiness**
   - **Blocked by:** Tidak ada — dapat mulai sekarang.
   - **Hasil:** Startup aplikasi + PostgreSQL dari lingkungan bersih, migration aman diulang, readiness saat DB mati, restart menjaga data, dan bind localhost. Rekonsiliasi pekerjaan P0 yang sudah ada; bukan implementasi ulang.

2. **Navigasi project melalui Graphify**
   - **Blocked by:** Tidak ada — dapat mulai sekarang.
   - **Hasil:** Generate/query graph kode dan dokumen tanpa mengindeks secret, foto atau data transaksi; runtime aplikasi tidak bergantung pada Graphify.

3. **Bootstrap admin dan login aman**
   - **Blocked by:** 01.
   - **Hasil:** Admin dibuat tanpa password default; login memakai Argon2id, token acak dengan hash tersimpan, pembatasan percobaan, identitas session aktif, dan log tersanitasi.

4. **Kedaluwarsa session dan logout**
   - **Blocked by:** 03.
   - **Hasil:** Idle 12 jam, absolut 7 hari, serta logout mencabut akses; perilaku diuji dengan waktu terkendali melalui request terautentikasi.

5. **Kelola akun dan cabut akses karyawan**
   - **Blocked by:** 04.
   - **Hasil:** Admin membuat akun individual, mereset password dan menonaktifkan akun; perubahan akses diaudit, reset/nonaktif mencabut semua session. Operasi write pertama membuktikan transaksi audit/idempotency, rollback, dan concurrent retry.

6. **Kelola Produk Jual per varian/ukuran**
   - **Blocked by:** 05.
   - **Hasil:** Admin mengelola harga, ketersediaan dan penonaktifan produk; karyawan hanya membaca. Nominal tervalidasi, daftar berpaginasi, dan master tidak dihapus secara destruktif.

7. **Kelola Bahan Baku/Kemasan**
   - **Blocked by:** 05.
   - **Hasil:** Admin mengelola master dengan satuan tetap dan presisi kuantitas eksplisit; karyawan ditolak, penonaktifan mempertahankan referensi, dan perubahan satuan tidak menafsirkan ulang riwayat.

8. **Catat Penjualan tunai**
   - **Blocked by:** 06.
   - **Hasil:** Penjualan multi-item menyimpan harga historis dan satu penerimaan sebesar total backend secara atomik; retry tidak menggandakan uang, tidak ada kembalian maupun pengurangan bahan otomatis.

9. **Lihat Penjualan sesuai pemilik dan hari WIB**
   - **Blocked by:** 08.
   - **Hasil:** Admin melihat semua penjualan; karyawan hanya transaksi sendiri pada hari berjalan. Detail dan daftar berpaginasi menolak akses lintas-petugas dan diuji pada pergantian hari WIB.

10. **Catat Penjualan QRIS tertunda**
   - **Blocked by:** 08.
   - **Hasil:** Penjualan QRIS dapat dibuat dan dibaca sebagai pending tanpa penerimaan pembayaran; retry tidak membuat penjualan kedua dan pelaku tidak dapat memundurkan tanggal.

11. **Unggah dan baca Bukti Pembayaran QRIS privat**
   - **Blocked by:** 10.
   - **Hasil:** Upload ke penjualan yang sudah ada memvalidasi JPEG/PNG/WebP maksimal 5 MB, membatasi decoding, membuang metadata lokasi, melindungi download, serta aman terhadap retry, kegagalan file, orphan, dan restart.

12. **Konfirmasi Pembayaran QRIS dengan bukti**
   - **Blocked by:** 11.
   - **Hasil:** Petugas berizin mencatat pemeriksaan merchant setelah foto tersedia; pembayaran diterima tepat sekali meski konfirmasi konkuren, dengan waktu penerimaan dan konfirmasi terpisah. Upload saja bukan pelunasan.

13. **Konfirmasi QRIS tanpa foto oleh admin**
   - **Blocked by:** 12.
   - **Hasil:** Pengecualian memerlukan alasan dan referensi merchant, mencatat pemeriksa/audit, serta menolak karyawan dan payload tanpa syarat wajib.

14. **Catat Input Susulan**
   - **Blocked by:** 12.
   - **Hasil:** Admin mencatat transaksi manual tunai/QRIS dengan waktu kejadian, petugas asli, referensi manual, dan harga historis beralasan; waktu/pelaku input tetap terpisah dan QRIS tetap melalui verifikasi normal.

15. **Catat Pengembalian Uang penuh**
   - **Blocked by:** 12.
   - **Hasil:** Admin mencatat dana yang sudah dikembalikan beserta waktu, metode aktual dan alasan; pembayaran pending, refund sebagian dan refund ganda ditolak, termasuk saat request konkuren.

16. **Batalkan Penjualan QRIS yang belum dibayar**
   - **Blocked by:** 10.
   - **Hasil:** Admin membatalkan pending dengan alasan/audit tanpa menghapus riwayat atau menciptakan refund; pembatalan dan perubahan pembayaran harus terlindung dari race.

17. **Batalkan Penjualan lunas tanpa menghilangkan uang**
   - **Blocked by:** 15.
   - **Hasil:** Pembatalan beralasan mempertahankan penerimaan dan memperlihatkan penyelesaian uang secara eksplisit; pembatalan tidak otomatis menjadi refund.

18. **Koreksi item Penjualan dengan total sama**
   - **Blocked by:** 12.
   - **Hasil:** Admin membuat revisi efektif yang terhubung ke catatan asli tanpa pembayaran kedua; riwayat, alasan dan audit tetap terbaca, tanpa hard-delete.

19. **Koreksi nominal pencatatan Penjualan**
   - **Blocked by:** 18, 15.
   - **Hasil:** Salah catat nominal diperbaiki sesuai kejadian asli tanpa refund fiktif; penerimaan efektif konsisten, koreksi setelah refund ditolak, dan race koreksi/refund hanya menghasilkan state yang valid.

20. **Koreksi metode Pembayaran**
   - **Blocked by:** 19, 13.
   - **Hasil:** Koreksi tunai/QRIS mempertahankan jejak revisi tanpa uang ganda; perubahan menjadi QRIS memerlukan verifikasi merchant dan bukti atau pengecualian admin yang sah.

21. **Catat Pembelian bahan dan penerimaan stok**
   - **Blocked by:** 07.
   - **Hasil:** Pembelian lunas/diterima sekaligus menambah stok satu kali; pembelian, mutasi, audit dan idempotency commit/rollback bersama, tanpa jalur penerimaan kedua.

22. **Catat Pembelian Peralatan**
   - **Blocked by:** 21.
   - **Hasil:** Alur pembelian mendukung peralatan yang sudah dibayar/diterima tanpa menambah stok bahan; rincian dan nilainya dapat dibaca kembali.

23. **Catat Pemakaian Bahan dan Bahan Rusak/Terbuang**
   - **Blocked by:** 21.
   - **Hasil:** Admin mencatat pemakaian agregat harian atau rusak/terbuang sebagai jenis kejadian berbeda; ledger terbaca dan dua request tidak bisa menghabiskan saldo yang sama hingga negatif.

24. **Lakukan Penyesuaian Stok beralasan**
   - **Blocked by:** 21.
   - **Hasil:** Admin merekonsiliasi jumlah fisik melalui mutasi beralasan; saldo dan riwayat konsisten, tidak negatif, dan aman saat request bersamaan.

25. **Koreksi pencatatan Mutasi Stok**
   - **Blocked by:** 23, 24.
   - **Hasil:** Admin memperbaiki pemakaian/rusak/penyesuaian dengan hubungan revisi dan audit; riwayat lama tetap ada, saldo dihitung konsisten, koreksi negatif ditolak atomik.

26. **Koreksi Pencatatan Pembelian**
   - **Blocked by:** 22.
   - **Hasil:** Koreksi bahan/peralatan memperbarui rincian, nilai dan dampak stok bersama, tanpa menghapus riwayat; saldo negatif membatalkan seluruh operasi, bukan disamarkan sebagai retur/refund pemasok.

27. **Catat Pengeluaran Operasional**
   - **Blocked by:** 05.
   - **Hasil:** Admin mencatat dan membaca pengeluaran berdasarkan kategori, nominal, tanggal dan catatan, dengan audit/retry aman; bukan pembelian atau refund.

28. **Koreksi Pengeluaran Operasional**
   - **Blocked by:** 27.
   - **Hasil:** Admin membetulkan pengeluaran dengan alasan dan hubungan pengganti; daftar memakai revisi efektif sementara riwayat asli dipertahankan.

29. **Laporan Penjualan Lunas Bruto dan Produk Jual**
   - **Blocked by:** 14, 17, 20.
   - **Hasil:** API JSON admin melaporkan bruto/produk menurut tanggal penjualan WIB dan revisi efektif; QRIS pending dikecualikan, refund tidak menghapus bruto, dan input susulan memperbarui periode asli.

30. **Laporan Penerimaan Pembayaran, refund dan QRIS tertunda**
   - **Blocked by:** 14, 17, 20.
   - **Hasil:** API JSON admin memisahkan tunai/QRIS menurut waktu uang diterima, refund menurut waktu dikembalikan, dan pending; waktu konfirmasi tidak menimpa tanggal uang dan hasil bukan laba.

31. **Laporan Pembelian dan Pengeluaran**
   - **Blocked by:** 26, 28.
   - **Hasil:** API JSON admin menampilkan nilai pembelian/pengeluaran menurut revisi efektif, rentang WIB dan pagination; refund tidak masuk biaya operasional dan fixture direkonsiliasi tanpa duplikasi.

32. **Buktikan integritas pada beban target**
   - **Blocked by:** 09, 16, 25, 29, 30, 31.
   - **Hasil:** Dataset sintetis setara 1.000 penjualan/hari dan 10 pengguna bersamaan membuktikan tidak ada lost update, pembayaran/refund ganda atau stok negatif; hardware, profil, latency dan error dilaporkan terukur.

33. **Serah-terima API untuk integrasi lokal**
   - **Blocked by:** 02, 32.
   - **Hasil:** Seluruh acceptance P0–P8 direkonsiliasi, startup/migration/restart database-foto diuji ulang, kontrak Swagger terlindungi dan lengkap untuk frontend, serta batas lokal/LAN, data uji dan risiko produksi dinyatakan jelas.


## Persetujuan sebelum publikasi

1. Apakah granularitas cukup kecil untuk satu sesi agent atau perlu dipecah lagi?
2. Apakah blocker benar-benar diperlukan; adakah dependensi yang bisa dilepas?
3. Tiket mana perlu digabung atau dipisah?

Sesudah disetujui, terbitkan satu GitHub issue per tiket dalam urutan dependensi,
dengan acceptance criteria konkret dan label `ready-for-agent`; hubungkan native
blocking edges menggunakan database issue ID. Jika API dependencies tidak
tersedia, tuliskan blocker issue nyata pada body. Tidak membuat/mengubah parent
issue tanpa instruksi. Nomor draft diganti nomor issue aktual saat publikasi.

Frontier awal: 01 dan 02. Klaim satu tiket aktif per branch mengikuti harness.
Milestone P0–P9 tetap agregat; penyelesaian satu child ticket tidak otomatis
meluluskan milestone. Petakan bukti tiket ke milestone terkait saat implementasi.

## Publikasi — 19 September 2026

Pembagian difinalisasi Manager Esteh atas otorisasi eksplisit pengguna
(19 September 2026; hanya finalisasi pembagian, publikasi issue, label, dan
relasi blocker — bukan commit/push/deploy atau perubahan scope bisnis).
Tracker: GitHub Issues `makayasa/esteh-backend-nestjs` sesuai
`docs/agents/issue-tracker.md`. Nomor draft resmi digantikan nomor issue.

### Keputusan merge/split

- Draft 12+13 → issue #12: konfirmasi QRIS dengan bukti dan pengecualian
  admin adalah satu transisi status dengan invariant konfirmasi/concurrency
  yang sama; dua tiket akan menduplikasi pengujian.
- Draft 21+22 → issue #20: satu alur pembelian; peralatan = pembelian tanpa
  mutasi stok bahan.
- Draft 23+24 → issue #21: satu ledger mutasi stok dengan tiga jenis kejadian
  (pemakaian, rusak/terbuang, penyesuaian) dan invariant non-negatif bersama.
- Tidak ada tiket yang dipecah; granularitas lain dipertahankan.
- Semua blocker draft dipertahankan, dipetakan ke nomor issue aktual
  (blocker draft 13 kini tercakup #12). Total 40 edge dependensi native
  `blocked_by` terpasang lewat API.

### Mapping draft → issue

| Draft | Issue | Catatan |
| --- | --- | --- |
| 01 | #1 | Ditutup setelah review manager; evidence runtime di `harness/progress/2026-09-19-p0-local-runtime-reconciliation.md` |
| 02 | #2 | Frontier saat publikasi |
| 03 | #3 | Frontier setelah #1 ditutup |
| 04 | #4 | |
| 05 | #5 | |
| 06 | #6 | |
| 07 | #7 | |
| 08 | #8 | |
| 09 | #9 | |
| 10 | #10 | |
| 11 | #11 | |
| 12+13 | #12 | Merge |
| 14 | #13 | |
| 15 | #14 | |
| 16 | #15 | |
| 17 | #16 | |
| 18 | #17 | |
| 19 | #18 | Blocked by #17, #14 |
| 20 | #19 | |
| 21+22 | #20 | Merge |
| 23+24 | #21 | Merge |
| 25 | #22 | |
| 26 | #23 | |
| 27 | #24 | |
| 28 | #25 | |
| 29 | #26 | |
| 30 | #27 | |
| 31 | #28 | |
| 32 | #29 | |
| 33 | #30 | |

Label: `ready-for-agent` dan `p0`–`p9` pada seluruh issue. Milestone
aggregate P0–P9 tetap dipegang tracker harness; penyelesaian child issue
tidak otomatis meluluskan milestone. Tidak ada parent/map issue dibuat.
