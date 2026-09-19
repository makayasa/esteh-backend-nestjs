# Rencana Implementasi MVP — Esteh Backend

Status: rencana berdasarkan kesepakatan Q1–Q39; belum diimplementasikan atau diuji.

- Keputusan dan riwayat revisi: [mvp-decisions.md](./mvp-decisions.md).
- Istilah domain: [CONTEXT.md](../../CONTEXT.md).
- Root implementasi: `esteh-backend-nestjs/`, bukan direktori induknya.
- Raw plan Obsidian tidak diubah.

## 1. Tujuan dan Batas Penerimaan

Menyediakan backend pencatatan operasional satu usaha/satu outlet: penjualan, pembayaran, stok bahan/kemasan, pembelian, pengeluaran, serta laporan bisnis dasar.

Ada tiga milestone yang berbeda:

1. **Running lokal**: aplikasi, PostgreSQL, migration, dan health check berjalan melalui Docker Compose. Bukan berarti fitur bisnis selesai.
2. **MVP untuk integrasi**: fitur yang disepakati selesai, teruji, dan terdokumentasi; digunakan di localhost/LAN tepercaya dengan data uji.
3. **Siap produksi**: tahap terpisah. Akses IP publik, HTTPS, backup/pemulihan, dan operasional harus ditinjau kembali sebelum transaksi nyata.

HTTP hanya untuk tahap lokal/LAN tepercaya dengan akun dan data uji. Jangan membuka port aplikasi ke internet atau memakai kredensial produksi pada tahap ini. Database tetap privat. Volume persisten bukan backup; RPO 1 jam/RTO 4 jam belum dijamin.

## 2. Kondisi Repo yang Diperiksa

- `src/app.module.ts` masih tanpa domain module; `src/main.ts` hanya bootstrap dan listen port.
- `package.json` mendeklarasikan NestJS 12, TypeScript 6, ESM, dan Vitest 4; kompatibilitas runtime/dependensi belum diuji pada sesi planning.
- Config Vitest unit dan e2e sudah ada, serta scripts build/lint/test.
- Prisma, Argon2id, dan Swagger belum tercantum sebagai dependensi langsung dalam `package.json` yang diperiksa.
- `README.md` masih template NestJS, termasuk referensi deployment Mau; bukan panduan deployment home server yang disepakati.
- Belum ada implementasi domain atau hasil pengujian baru yang dapat diklaim dari sesi ini.

## 3. Scope Aktif

| Area | Termasuk |
| --- | --- |
| Identitas | Akun individual admin/karyawan; tanpa registrasi publik; reset password dan penonaktifan oleh admin |
| Session | Token acak revocable, hash di PostgreSQL; idle 12 jam, absolut 7 hari; Argon2id dan pembatasan login |
| Katalog | Produk per kombinasi varian/ukuran, harga, ketersediaan; master bahan/kemasan dengan satuan tetap |
| Penjualan | Banyak item, kuantitas, harga historis, satu metode tunai/QRIS; nominal rupiah bulat |
| Tunai | Penerimaan sebesar total penjualan; tidak ada uang diserahkan, pecahan, atau kembalian |
| QRIS | Konfirmasi manual merchant, bukti foto privat, status tertunda, pengecualian tanpa foto khusus admin |
| Koreksi | Catatan asli dipertahankan, hubungan pengganti, alasan dan audit; bukan perpindahan uang fiktif |
| Refund | Pengembalian penuh yang benar-benar sudah dilakukan di luar sistem; admin mencatatnya |
| Stok | Penerimaan pembelian, pemakaian agregat harian, rusak/terbuang, penyesuaian; tidak negatif |
| Pembelian | Dibayar penuh dan diterima sekaligus; bahan menambah stok, alat tidak masuk stok bahan |
| Pengeluaran | Kategori, nominal, tanggal, catatan; terpisah dari pembelian dan refund |
| Input susulan | Admin, referensi manual, petugas asli, waktu kejadian/input terpisah, harga historis beralasan |
| Laporan | JSON, rentang tanggal WIB, admin saja; penjualan, produk, penerimaan, refund, pembelian/pengeluaran, QRIS tertunda |
| Infrastruktur awal | Docker Compose lokal/LAN, migration, volume database/foto, Swagger terbatas, log lokal dan health check |
| Tooling | Vitest dan Graphify untuk pengembangan; Graphify bukan dependensi produksi |

### Tidak termasuk atau ditunda

- Frontend/mobile UI, CSV/PDF, laba/HPP, peramalan bisnis.
- Multi-outlet/multi-usaha, offline sync, resep/pemotongan bahan otomatis.
- Diskon, utang, pembayaran campuran/sebagian, topping/modifier, bundling, refund sebagian.
- Shift, saldo laci, selisih kas, stok peralatan, penyusutan alat, utang pemasok, retur/refund pemasok.
- Integrasi payment gateway, verifikasi QRIS otomatis, atau proses settlement bank.
- Redis, microservices, message broker.
- Pada tahap awal: IP publik, HTTPS, backup eksternal, Telegram/pemantau eksternal. Backblaze B2/Restic tidak dipilih untuk tahap ini.
- Penghapusan otomatis bukti transaksi; retensi harus diputuskan sebelum fitur tersebut ditambahkan.

## 4. Rancangan Module

Modular monolith: satu aplikasi NestJS, satu PostgreSQL, Prisma, satu penyimpanan foto privat. Tidak perlu database atau deployment terpisah per module.

| Module | Perilaku di balik interface |
| --- | --- |
| Identity | Login/session, akun, reset password, pencabutan akses dan pemeriksaan role |
| Catalog | Produk jual, harga/ketersediaan, master bahan/kemasan dan satuannya |
| Sales | Penjualan, pembayaran, konfirmasi QRIS, input susulan, koreksi/pembatalan/refund beserta invariant uang |
| Inventory & Purchasing | Pembelian dan mutasi stok, termasuk atomisitas serta koreksi yang tidak menyebabkan saldo negatif |
| Expenses | Pengeluaran operasional dan koreksinya |
| Reporting | Query lintas domain dengan definisi tanggal dan revisi efektif yang konsisten; tidak melakukan mutasi |
| Evidence | Validasi, penyimpanan, dan pembacaan foto privat melalui operasi yang sudah diotorisasi |

Prisma/config/audit/idempotency adalah fasilitas internal bersama, bukan domain tambahan. Controller memanggil operasi bisnis, bukan merangkai sendiri perubahan pembayaran, stok, dan audit.

- Interface module menyembunyikan urutan transaksi dan invariant; jangan membuat caller mengingat kapan harus menambah stok atau mencatat audit.
- Kepemilikan satu transaksi database untuk setiap operasi bisnis harus jelas, termasuk idempotency dan audit.
- Uji perilaku melalui interface module/HTTP; uji integrasi invariant database memakai PostgreSQL nyata, bukan hanya mock Prisma.
- Hindari generic repository atau seam spekulatif untuk storage/database lain yang belum dibutuhkan.
- Nama class, tabel, enum, dan endpoint merupakan detail rancangan implementasi, bukan istilah baru untuk mengubah keputusan bisnis.

## 5. Aturan Data dan Konsistensi

1. Harga/nominal dihitung tepat, bukan floating-point; total penjualan normal dihitung backend. Dokumentasikan batas nominal dan representasi JSON.
2. Harga pada item penjualan adalah snapshot. Perubahan katalog tidak mengubah riwayat. Harga input susulan hanya boleh diisi admin sesuai catatan manual dan audit.
3. Waktu kejadian, waktu uang diterima/dikembalikan, waktu konfirmasi, serta waktu/pelaku input dibedakan. Simpan waktu secara tidak ambigu; periode laporan memakai `Asia/Jakarta`.
4. Status penjualan, status pembayaran, koreksi, dan refund tidak boleh dilebur sehingga riwayat uang hilang. QRIS pending bukan lunas.
5. Koreksi memakai hubungan revisi/pengganti; laporan memakai revisi efektif satu kali. Catatan lama tetap dapat diaudit dan tidak dihitung sebagai transaksi tambahan.
6. Pembetulan nominal Rp10.000 menjadi Rp5.000 sesuai kejadian asli bukan refund Rp5.000. Koreksi tidak menciptakan penerimaan baru; riwayat pembetulan pembayaran tetap tersimpan.
7. Pembatalan penjualan lunas tidak menghapus penerimaan. Penyelesaian uang harus eksplisit; refund hanya tercatat setelah dana benar-benar dikembalikan.
8. Penjualan Senin/refund Selasa tetap muncul pada tanggal masing-masing. Refund tidak menghilangkan bruto penjualan asli dan tidak masuk pengeluaran operasional.
9. Nilai QRIS berdasarkan transaksi yang dikonfirmasi dari sisi merchant; jangan mengklaim rekonsiliasi dana settlement bank atau perhitungan biaya QRIS.
10. Pembelian bahan, mutasi stok, audit, dan hasil idempotency commit atau rollback bersama. Pembelian alat tidak menambah bahan.
11. Stok tidak negatif, termasuk pada concurrency dan koreksi. Satuan tetap per bahan; presisi kuantitas divalidasi/didokumentasikan dan tidak ada konversi satuan otomatis.
12. Penjualan/refund tidak mengubah stok bahan otomatis. Pemakaian/rusak/penyesuaian merupakan kejadian terpisah.
13. Retry dengan identitas request dan payload sama mengembalikan hasil yang sama; key sama dengan payload berbeda ditolak. Scope key mencakup pelaku dan operasi. Pemeriksaan izin/session tetap berjalan sebelum mengembalikan hasil retry.
14. Tidak ada hard-delete transaksi keuangan/mutasi stok yang sudah tercatat. Master yang direferensikan riwayat tidak boleh dihapus secara destruktif.
15. Foto bukan resource publik. Izin dilihat berdasarkan transaksi dan role; nama file/ID saja tidak memberi akses. DB dan filesystem tidak atomik: tulis file secara aman sebelum mereferensikannya, dan tangani file sementara/orphan tanpa menghapus bukti yang sudah terikat transaksi.
16. Jangan mencatat password, token, atau isi foto pada log/audit. Perubahan hak akses, koreksi, refund, dan pengecualian QRIS harus memiliki pelaku, waktu, serta alasan yang relevan.

## 6. Urutan Pengerjaan

Dependensi utama:

```text
P0 Running lokal
 └─ P1 Fondasi kontrak, transaksi, audit, idempotency
     └─ P2 Identitas dan session
         └─ P3 Katalog
             ├─ P4 Penjualan tunai → P5 QRIS/bukti → P6 Koreksi/refund/input susulan
             └─ P7 Stok/pembelian/pengeluaran
P6 + P7 → P8 Laporan JSON → P9 Integrasi dan handoff
```

P7 dapat dikerjakan paralel dengan P4–P6 setelah kontrak katalog, transaksi, otorisasi, dan audit stabil. Setiap tahap harus menambahkan test sesuai perilakunya; pengujian tidak ditunda seluruhnya ke P9.

### P0 — Aplikasi Bisa Running Lokal

**Task**
- Verifikasi Node, npm lockfile, NestJS/TypeScript/ESM, Prisma dan image PostgreSQL yang kompatibel; pin versi yang dipilih. Jangan mengasumsikan hasil build berdasarkan deklarasi package.
- Siapkan Prisma dan migration awal untuk membuktikan koneksi; perluas schema per tahap, bukan semua domain sekaligus.
- Buat Dockerfile/Compose untuk aplikasi + PostgreSQL, konfigurasi tervalidasi, `.env.example` tanpa secret, dan health/readiness check.
- Batasi publikasi aplikasi ke localhost secara default. LAN harus opt-in dengan konfigurasi jaringan yang dijelaskan; database tidak dipublikasikan pada Compose normal.
- Pakai volume persisten dan dokumentasikan startup/migration/stop tanpa menghapus data; update README template menjadi panduan project.
- Siapkan Graphify sebagai tooling development terhadap kode/dokumen project, tanpa mengindeks `.env`, kredensial, database, atau foto.

**Acceptance criteria**
- Dari environment bersih, mengikuti README menghasilkan aplikasi dan database yang sehat; migration dapat diterapkan ulang dengan aman.
- Restart container mempertahankan data uji; pemeriksaan koneksi DB menunjukkan not-ready ketika DB tidak tersedia.
- Endpoint tidak terbuka melalui semua interface secara tidak sengaja; tidak perlu domain, IP publik, layanan backup, atau layanan notifikasi untuk startup.
- Graphify tidak diperlukan untuk menjalankan image aplikasi; cara generate/query graph terdokumentasi.

### P1 — Fondasi Kontrak dan Konsistensi

**Task**
- Tetapkan format request/response JSON, validation, error, pagination, tanggal WIB, dan nominal; dokumentasikan melalui Swagger.
- Rancang tabel/constraint serta pemetaan operasi ke transaksi database: idempotency, audit, hubungan koreksi, dan perubahan status yang diperbolehkan.
- Siapkan database test terisolasi, fixture sintetis, serta helper waktu terkendali untuk tes session/pergantian hari.
- Buat log lokal aman dan batas request/upload. Dokumentasikan kebijakan akses Swagger; jangan menganggap tombol Authorize otomatis melindungi halaman dokumen.

**Acceptance criteria**
- Payload invalid ditolak dengan respons konsisten; error tidak membocorkan SQL/secret.
- Retry identik tidak menggandakan efek; key sama/payload berbeda menghasilkan konflik.
- Kegagalan operasi tidak meninggalkan audit sukses atau mutasi parsial. Request konkuren dengan key sama diuji.
- Kontrak tidak memuat field uang diserahkan/kembalian atau fitur di luar scope.

### P2 — Identitas, Role, dan Session

**Task**
- Bootstrap admin melalui proses lokal yang aman, tanpa akun/password default yang diketahui bersama.
- Implementasikan login/logout, identitas session aktif, pengelolaan akun oleh admin, reset password, dan penonaktifan.
- Simpan hash password Argon2id dan hash token session; terapkan idle 12 jam, absolut 7 hari, pembatasan login dan redaksi log.
- Terapkan izin admin/karyawan pada operasi serta objek yang diminta, bukan hanya pada route.

**Acceptance criteria**
- Login valid berhasil; akun nonaktif/password salah gagal tanpa membuka informasi sensitif.
- Idle 12 jam dan batas absolut 7 hari diuji menggunakan waktu terkendali; aktivitas tidak memperpanjang batas absolut.
- Logout, reset password, dan penonaktifan mencabut session sesuai scope yang disepakati.
- Karyawan tidak dapat mengelola akun, stok, laporan, atau transaksi milik orang lain. Batas hari WIB membatasi akses transaksi sendiri pada hari berjalan; admin menangani kasus tertunda hari sebelumnya.
- Request menggunakan session dicabut tetap ditolak meskipun membawa key retry yang pernah berhasil.

### P3 — Katalog Produk dan Bahan

**Task**
- Master produk per varian/ukuran, harga, serta ketersediaan; master bahan/kemasan dengan satuan tetap.
- Admin mengelola katalog; karyawan membaca produk untuk pencatatan penjualan.
- Pastikan perubahan nama/harga/status master tidak merusak riwayat transaksi; gunakan penonaktifan untuk master yang sudah direferensikan.

**Acceptance criteria**
- Regular/Jumbo dapat memiliki harga dan ketersediaan berbeda.
- Harga/ketersediaan divalidasi backend; karyawan tidak bisa mengubahnya lewat payload penjualan.
- Tidak ada stok minuman siap jual, modifier, bundling, resep, atau perubahan satuan yang menafsirkan ulang riwayat stok.

### P4 — Penjualan Tunai End-to-End

**Task**
- Buat penjualan multi-item dengan harga snapshot dan satu pembayaran tunai sebesar total, secara atomik.
- Implementasikan detail/daftar transaksi menurut izin, pelaku dan waktu kejadian/input.
- Integrasikan audit dan idempotency pada write path.

**Acceptance criteria**
- Penjualan 2 × Rp5.000 menghasilkan satu penerimaan Rp10.000, tanpa field uang diserahkan/kembalian.
- Total dari client tidak dapat mengganti hasil perhitungan backend; harga katalog baru tidak mengubah penjualan lama.
- Timeout lalu retry tidak membuat penjualan/penerimaan baru.
- Pencatatan tunai tidak mengurangi bahan secara otomatis; penjualan normal oleh karyawan tidak bisa dimundurkan tanggalnya.

### P5 — QRIS dan Bukti Privat

**Task**
- Buat penjualan QRIS pending, unggah bukti terhadap penjualan yang sudah ada, dan konfirmasi manual merchant.
- Validasi isi JPEG/PNG/WebP maksimal 5 MB; batasi sumber daya decoding dan buang metadata lokasi.
- Simpan file privat pada volume; lindungi download dengan izin transaksi, bukan tautan statis.
- Admin dapat mengonfirmasi tanpa foto hanya dengan alasan dan referensi merchant; simpan identitas pemeriksa serta waktu konfirmasi.

**Acceptance criteria**
- QRIS pending tidak masuk penjualan lunas/penerimaan terkonfirmasi; upload foto saja tidak mengubahnya menjadi lunas.
- Karyawan tidak dapat mengonfirmasi tanpa foto; pengecualian admin tanpa alasan/referensi ditolak.
- Retry upload/konfirmasi tidak membuat penjualan atau pembayaran ganda; dua konfirmasi konkuren hanya memiliki satu efek.
- File invalid/terlalu besar ditolak; user lain tidak dapat membaca foto dengan menebak ID.
- Bukti yang sudah diunggah tetap ada setelah restart; kegagalan tulis file tidak menghasilkan referensi bukti rusak yang dianggap sukses.

### P6 — Koreksi, Pembatalan, Refund, dan Input Susulan

**Task**
- Buat operasi admin untuk input susulan, koreksi pencatatan dan pembatalan dengan aturan penyelesaian pembayaran yang eksplisit.
- Koreksi menghubungkan catatan lama/pengganti dan memperbarui laporan efektif tanpa menggandakan penerimaan; metode QRIS tetap diverifikasi.
- Catat refund penuh setelah pengembalian nyata, beserta waktu kejadian, metode aktual pengembalian, pelaku, dan alasan; cegah refund ganda.
- Larang koreksi biasa setelah refund. Jangan menambahkan jalur admin tersembunyi yang melewati aturan ini.

**Acceptance criteria**
- Input transaksi kemarin oleh admin mempertahankan waktu kejadian asli, waktu input, petugas, referensi manual, dan harga historis beralasan.
- Salah catat Rp10.000 padahal Rp5.000 dikoreksi menjadi penerimaan efektif Rp5.000 tanpa refund fiktif; riwayat nilai lama tetap terlihat.
- Koreksi item dengan total sama tidak membuat pembayaran kedua; koreksi metode cash ke QRIS memerlukan bukti/verifikasi sesuai aturan.
- Pembatalan lunas tidak bisa menyembunyikan dana yang pernah diterima; pending yang benar-benar belum dibayar dapat dibatalkan tanpa refund.
- Refund penuh satu kali berhasil; sebagian, ganda, refund atas pembayaran pending, dan koreksi biasa setelah refund ditolak.
- Permintaan koreksi/refund bersamaan tidak menghasilkan revisi pembayaran yang tidak sesuai dengan dana yang sudah dikembalikan.

### P7 — Stok, Pembelian, dan Pengeluaran

**Task**
- Buat pembelian bahan/kemasan atau alat yang sudah dibayar dan diterima; bahan menambah stok tepat sekali.
- Implementasikan pemakaian agregat harian, rusak/terbuang, penyesuaian fisik beralasan, serta ledger mutasi.
- Catat pengeluaran operasional terpisah dari pembelian dan refund.
- Terapkan koreksi pembelian/pengeluaran/mutasi tanpa hard-delete; koreksi pembelian memperbarui stok dan nilai pembelian bersama.

**Acceptance criteria**
- Pembelian 1.000 gram gula menambah 1.000 gram tepat sekali, termasuk ketika retry; pembelian alat tidak menambah bahan.
- Tidak tersedia jalur penerimaan kedua yang menggandakan stok untuk pembelian yang sama.
- Pemakaian/rusak/penyesuaian memiliki riwayat dan tidak mengizinkan saldo negatif, termasuk saat dua request berebut saldo yang sama.
- Kegagalan mutasi stok membatalkan seluruh pencatatan pembelian; koreksi dengan saldo akhir negatif ditolak tanpa perubahan parsial.
- Perhitungan saldo dan riwayat tetap konsisten setelah koreksi; retur/refund pemasok tidak disamarkan sebagai pembetulan data.
- Karyawan tidak bisa mencatat atau mengoreksi pembelian, pengeluaran, maupun mutasi stok.

### P8 — Laporan JSON

**Task**
- Endpoint admin untuk ringkasan/detail penjualan lunas bruto dan produk terjual, penerimaan tunai/QRIS, refund, pembelian, pengeluaran, serta QRIS tertunda terpisah.
- Terapkan filter rentang tanggal WIB, pagination daftar, dan definisi metrik pada Swagger; tidak ada CSV/PDF/UI.
- Pastikan penjualan terkoreksi dihitung melalui revisi efektif dan refund tidak menghapus bruto penjualan asli.

**Acceptance criteria**
- Penjualan/penerimaan Senin Rp10.000 dan refund Selasa Rp10.000 tampil pada hari masing-masing, tanpa refund sebagai biaya operasional.
- Penjualan terjadi Senin, dana diterima Selasa, konfirmasi Rabu: bruto berdasarkan tanggal penjualan dan penerimaan berdasarkan tanggal penerimaan yang sebenarnya; waktu konfirmasi tidak menimpa keduanya.
- QRIS pending tidak ikut angka lunas; koreksi dan input susulan memperbarui periode yang relevan, bukan menambah duplikasi pada hari input.
- Batas 23.59/00.00 WIB diuji terhadap penyimpanan waktu database.
- Jumlah/nominal laporan direkonsiliasi terhadap fixture transaksi; tidak ada field yang mengklaim laba atau saldo laci.

### P9 — Verifikasi dan Handoff Frontend

**Task**
- Lengkapi README lokal/LAN, Swagger, contoh payload/error, aturan retry, waktu, nominal, autentikasi, dan alur upload dua langkah.
- Dokumentasikan bahwa token mobile harus disimpan melalui penyimpanan aman perangkat; HTTP lokal hanya untuk data uji dan konfigurasi development.
- Jalankan build, lint, unit/integration/e2e test serta uji concurrency dan restart volume.
- Gunakan dataset sintetis setara 1.000 penjualan/hari dan 10 pengguna bersamaan; catat hardware, profil beban, error dan latency yang terukur, bukan menjanjikan angka tanpa pengujian.
- Perbarui graph kode/dokumen setelah interface stabil; pastikan hasil Graphify tidak berisi secret/data transaksi.

**Acceptance criteria**
- Seluruh skenario P0–P8 lulus; API dapat diuji frontend dari Swagger tanpa menebak aturan bisnis.
- Uji beban tidak menunjukkan lost update, pembayaran/refund ganda, stok negatif, atau error integritas. Hasil performa dan keterbatasan ditulis.
- Verifikasi bersih menggunakan `npm run build`, `npm run lint`, `npm test`, dan `npm run test:e2e` sesuai konfigurasi final.
- Docker Compose dapat dijalankan ulang mengikuti dokumentasi; tidak ada dependency layanan eksternal yang ditunda.
- Serah-terima menyebut status **siap integrasi lokal**, bukan siap transaksi nyata melalui internet. Uji mobile nyata dengan data sintetis dilakukan saat frontend tersedia; ketiadaan frontend tidak menghalangi pengujian backend.

## 7. Risiko dan Checklist Sebelum Produksi

Bagian ini adalah backlog terpisah, bukan syarat milestone running lokal dan bukan persetujuan atas provider tertentu.

- **Akses publik**: verifikasi IP/routing/firewall, reverse proxy HTTPS, trust sertifikat pada mobile, dan pembaruan sertifikat sebelum membuka transaksi nyata. Tidak ada mode melewati validasi sertifikat.
- **Kehilangan data**: tentukan backup database + bukti di luar server, kunci pemulihan, retensi, serta uji restore. Target RPO/RTO harus diuji kembali; tidak ada klaim terpenuhi dari volume persisten.
- **Ketersediaan**: gangguan listrik/internet/server menyebabkan fallback manual. Tentukan tanggung jawab pemulihan, pemantauan eksternal/notifikasi, dan rekonsiliasi catatan manual.
- **Privasi/kapasitas**: foto privat tetap dapat berisi data pribadi; tentukan retensi dan proses penghapusan sebelum data nyata menumpuk. Tidak ada auto-delete bukti pada MVP.
- **QRIS manual**: screenshot bukan bukti settlement bank; petugas tetap bertanggung jawab memeriksa merchant. Tidak ada jaminan antifraud otomatis.
- **Mutu stok**: tanpa resep otomatis, akurasi bergantung pada pemakaian harian dan penyesuaian fisik oleh admin.
- **Laporan berubah**: koreksi/input susulan dapat mengubah angka historis; frontend harus membedakan tanggal kejadian dari waktu input dan tidak mengklaim laporan sudah ditutup permanen.
- **Alur nyata**: uji bersama frontend/mobile sebelum go-live, termasuk retry koneksi buruk dan pemulihan upload bukti.

## 8. Titik Mulai Agent Implementer

Mulai dari **P0**, bukan mengimplementasikan semua tabel/endpoint sekaligus. Baca keputusan terbaru dan glosarium, periksa working tree, lalu verifikasi kompatibilitas stack. Hentikan dan minta keputusan jika implementasi membutuhkan perubahan bisnis atau perluasan scope; jangan mengaktifkan layanan eksternal/public deployment hanya karena tercantum pada riwayat rekomendasi lama.

Rencana ini tidak menyatakan build/test/deployment sudah berhasil. Tidak ada dependensi yang dipasang, migration yang dijalankan, atau kode aplikasi yang diubah untuk menghasilkan dokumen ini.
