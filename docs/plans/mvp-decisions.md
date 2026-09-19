# Keputusan Perencanaan MVP Esteh

Status: keputusan scope Q1–Q39 dikonfirmasi pengguna. Rencana pengerjaan tersedia di [mvp-implementation-plan.md](./mvp-implementation-plan.md); implementasi belum dimulai.
Sumber: raw plan `Esteh Backend NestJS.md` di Obsidian dan jawaban pengguna atas Q1–Q39. Keputusan putaran terbaru mengesampingkan keputusan sebelumnya jika bertentangan.

## Stack dari raw plan

- NestJS, PostgreSQL, Docker pada home server Linux, dan Swagger.
- Argon2id untuk hashing password; session acak yang dapat dicabut, dengan hash token di PostgreSQL (Q28).
- Graphify untuk membantu navigasi project oleh agent; belum dipasang dalam sesi perencanaan ini.

## Putaran 1 — Disepakati

- Q1: laporan MVP mencakup omzet harian, jumlah produk terjual, komposisi pembayaran tunai/QRIS, dan pengeluaran. Selisih penjualan dan pembelian tidak disebut laba.
- Q2: bedakan Penjualan, Pembayaran, dan Pembelian dari sudut pandang usaha.
- Q3: bedakan Produk Jual, Bahan Baku/Kemasan, dan Peralatan; tanpa pemotongan bahan otomatis berdasarkan resep.
- Q4: satu usaha, satu outlet; tidak multi-usaha.
- Q5: online-only, dengan catatan manual saat gangguan.
- Q6: pembayaran QRIS diperiksa melalui notifikasi/riwayat merchant; foto hanya bukti pendukung, bukan verifikasi otomatis.
- Q7: deliverable repo berupa backend/API, Swagger, dan deployment. Mobile/admin UI merupakan pekerjaan terpisah.

## Putaran 2 — Disepakati

- Q8: stok bahan/kemasan dengan satu satuan tetap per item; penerimaan, pemakaian manual, dan penyesuaian beralasan. Produk minuman menggunakan status tersedia/tidak tersedia; peralatan tidak masuk stok bahan.
- Q9: penjualan mendukung banyak item dan kuantitas, satu metode pembayaran, harga dari backend serta harga historis. Tanpa diskon, utang, atau pembayaran campuran.
- Q10: QRIS menunggu konfirmasi tidak masuk omzet lunas. Karyawan mengonfirmasi setelah pemeriksaan merchant dan unggahan foto wajib. Admin menyelesaikan atau membatalkan kasus tertunda dengan alasan; tidak ada pembatalan otomatis berbasis waktu. Pengecualian foto tidak tersedia ditetapkan pada Q26.
- Q11: transaksi lunas tidak diedit/dihapus. Admin membatalkan/mengoreksi dengan alasan dan audit, serta membuat transaksi pengganti bila perlu. Pengembalian uang terpisah, hanya penuh, dan pelaksanaannya manual di luar sistem. Pemisahan koreksi pencatatan dari refund diperjelas pada Q20; koreksi nominal/metode diperbolehkan sesuai Q25.
- Q12: input susulan dilakukan admin dengan waktu kejadian asli, petugas, dan referensi catatan manual; waktu serta pelaku input tetap disimpan. Karyawan tidak dapat memundurkan tanggal.
- Q13: pembelian memiliki rincian item; pengeluaran operasional memiliki kategori, nominal, tanggal, dan catatan. Hanya pembayaran penuh, tanpa utang pemasok atau penyusutan alat.
- Q14: tanpa modul shift/saldo laci/selisih kas. Total tunai harian untuk pengecekan manual.
- Q15: akun individual tanpa pendaftaran publik. Admin mengelola akun/reset password; penonaktifan mencabut semua session. Karyawan mencatat penjualan dan melihat transaksi sendiri pada hari berjalan. Admin mengakses seluruh transaksi, laporan, katalog, dan stok.
- Q16: batas hari kalender menurut zona waktu outlet; laporan memakai waktu kejadian sehingga input susulan dapat memperbarui hari sebelumnya. Zona waktu Asia/Jakarta (WIB) dikonfirmasi pada Q22.

## Putaran 3 — Disepakati

- Q17: pembelian MVP sudah dibayar penuh dan diterima sekaligus. Pencatatan pembelian bahan menambah stok tepat sekali, tanpa penerimaan manual tambahan untuk pembelian yang sama. Pembelian alat tidak menambah stok bahan.
- Q18: admin mencatat pemakaian bahan agregat harian. Bahan rusak/terbuang merupakan pengurangan tersendiri dengan alasan. Stok negatif ditolak; selisih fisik diselesaikan melalui penyesuaian beralasan dengan riwayat. Pembatalan penjualan tidak mengembalikan bahan secara otomatis.
- Q19 (revisi pengguna): tunai hanya mencatat nominal pemasukan sebesar total penjualan. Tidak mencatat uang diserahkan, pecahan uang, atau kembalian. Tidak ada validasi uang diserahkan terhadap total karena data tersebut tidak dikumpulkan. Nominal rupiah bulat sesuai rekomendasi awal; pembayaran sebagian tetap di luar scope.
- Q20: koreksi pencatatan menghubungkan catatan lama dan pengganti tanpa membuat penerimaan atau pengembalian uang fiktif. Refund dicatat setelah uang benar-benar dikembalikan. Pembatalan transaksi lunas harus menjelaskan penyelesaian uangnya, bukan menghilangkan pembayaran.
- Q21: pisahkan penjualan lunas bruto berdasarkan tanggal penjualan, refund berdasarkan tanggal uang dikembalikan, dan penerimaan pembayaran berdasarkan tanggal uang diterima. Penjualan Senin/refund Selasa tetap tampil pada tanggal masing-masing. Refund bukan pembelian/pengeluaran operasional; penerimaan dikurangi refund bukan laba.
- Q22: zona waktu bisnis Asia/Jakarta; pergantian hari pukul 00.00 WIB.
- Q23: admin dapat memasukkan harga historis sesuai catatan manual pada input susulan, dengan alasan dan audit. Penjualan normal tetap memakai harga backend; ini bukan fasilitas diskon.
- Q24: setiap kombinasi varian/ukuran merupakan Produk Jual tersendiri dengan harga/ketersediaan sendiri. Tanpa modifier/topping atau bundling pada MVP.

## Putaran 4 — Disepakati

- Q25: admin boleh mengoreksi nominal/metode untuk membetulkan pencatatan sesuai kejadian sebenarnya, dengan alasan, riwayat lama, dan pembaruan laporan. Koreksi bukan perubahan kesepakatan jual-beli dan tidak membuat refund fiktif. Koreksi metode menjadi QRIS memerlukan verifikasi merchant. Transaksi yang sudah memiliki refund tidak dapat dikoreksi melalui alur biasa.
- Q26: unggahan QRIS gagal dapat diulang tanpa membuat penjualan baru. Jika bukti benar-benar tidak tersedia, hanya admin boleh mengonfirmasi tanpa foto, dengan alasan, referensi transaksi merchant, dan audit. Ini pengecualian terhadap Q10, bukan jalur normal karyawan.
- Q27: foto berada di penyimpanan privat pada volume Docker; izin akses mengikuti transaksi. JPEG/PNG/WebP maksimal 5 MB, validasi isi file, metadata lokasi dibuang. Tidak ada penghapusan otomatis bukti transaksi pada MVP; kebijakan retensi ditetapkan sebelum fitur penghapusan ditambahkan. Kapasitas disk dipantau.
- Q28: token session acak yang dapat dicabut; hanya hash token disimpan di PostgreSQL. Kedaluwarsa setelah 12 jam tidak aktif atau maksimal 7 hari. Logout mencabut session terkait; reset password dan penonaktifan mencabut semua session. Password memakai Argon2id; login dibatasi percobaannya; tidak ada password default bersama.
- Q29 (revisi pengguna): sementara memakai IP publik milik pengguna, tanpa Cloudflare Tunnel. HTTPS ditunda pada Q33; Q39 membatasi tahap awal ke localhost/LAN tepercaya dengan data uji. IP publik adalah target tahap berikutnya, bukan akses tahap awal. PostgreSQL tidak diekspos; Swagger dibatasi admin/developer. Domain dan akun Cloudflare bukan prasyarat yang disepakati.
- Q30: target kehilangan data maksimal 1 jam (RPO) dan pemulihan maksimal 4 jam (RTO), harus dibuktikan melalui uji restore. Backup database dan foto secara konsisten, terenkripsi, di luar home server. Kegagalan backup menghasilkan notifikasi; backup di disk yang sama tidak cukup. UPDATE Q34–Q35: backup eksternal dan notifikasi ditunda; target ini belum dapat dijamin dan bukan klaim kesiapan tahap running awal.
- Q31: identitas request mencegah operasi pencatatan ganda akibat retry. Pembelian dan penambahan stok atomik. Konfirmasi pembayaran/refund berulang tidak menggandakan nominal. Duplikasi catatan manual tetap diperiksa admin.
- Q32: target 10 pengguna bersamaan dan 1.000 penjualan/hari. Gerbang go-live mencakup pengujian hak akses, retry/duplikasi, stok, koreksi/refund, pergantian hari WIB, serta restore database dan foto. Uji alur dengan aplikasi mobile merupakan syarat go-live operasional walaupun UI di luar scope repo. UPDATE Q33–Q35: prioritas pengguna adalah running dahulu; kesiapan produksi dan uji restore tidak boleh dianggap terpenuhi hanya karena backend dapat berjalan.

## Putaran 5 — Keputusan Pengguna

- Q33: HTTPS ditunda; prioritas backend bisa running dahulu. Penundaan ini bukan persetujuan eksplisit atas penggunaan kredensial/data nyata melalui HTTP publik. Batas akses tahap awal dikonfirmasi pada Q39: localhost/LAN tepercaya, data uji.
- Q34: backup eksternal yang direkomendasikan (Backblaze B2/Restic dan retensinya) tidak diperlukan untuk sekarang; jangan menjadikannya dependensi tahap running awal. Tidak ada provider backup, jadwal, retensi, atau anggaran layanan yang disetujui pada putaran ini. Target pemulihan Q30 belum dapat dijamin.
- Q35: notifikasi operasional eksternal yang direkomendasikan ditunda. Telegram dan penyedia pemantau eksternal bukan dependensi tahap running awal.
- Q36: pembelian, pengeluaran, dan mutasi stok tidak diedit/dihapus tanpa riwayat. Koreksi admin beralasan menghubungkan catatan lama dan pengganti. Koreksi pembelian menyesuaikan stok/laporan secara atomik dan ditolak jika saldo akhirnya negatif. Retur barang/refund pemasok di luar MVP dan bukan koreksi pencatatan.
- Q37: laporan hanya melalui API JSON; tidak ada ekspor CSV, PDF, atau UI di repo backend. Semua tampilan menjadi tanggung jawab frontend. Cakupan laporan mengikuti rekomendasi: penjualan lunas bruto, produk terjual, penerimaan tunai/QRIS, refund, pembelian, pengeluaran operasional, dan daftar QRIS tertunda terpisah. Akses admin, rentang tanggal menurut WIB, mengikuti koreksi terbaru; tanpa perhitungan laba.
- Q38: modular monolith NestJS + PostgreSQL + Prisma, Docker Compose, migration database, Swagger sebagai kontrak API, Vitest yang sudah tersedia. Session di PostgreSQL; tanpa Redis, microservices, atau message broker. Graphify untuk pengembangan, bukan komponen produksi. Kompatibilitas versi diverifikasi sebelum pemasangan dependensi.

## Putaran 6 — Batas Tahap Awal Dikonfirmasi

- Q39: pengguna mengikuti rekomendasi: tahap awal untuk pengembangan/uji integrasi di localhost atau LAN tepercaya dengan data uji, bukan transaksi nyata melalui HTTP publik.
- IP publik tetap target deployment berikutnya. Tidak ada persetujuan untuk membuka HTTP publik dengan kredensial/data nyata.
- HTTPS, backup eksternal, dan notifikasi tidak menghalangi milestone running lokal; penundaan bukan penghapusan risiko atau pemenuhan target pemulihan.
- Penyusunan rencana implementasi dan acceptance criteria disetujui; implementasi kode belum dimulai.

## Dokumen Turunan

- [Glosarium domain](../../CONTEXT.md).
- [Rencana implementasi bertahap](./mvp-implementation-plan.md).
- Catatan putaran lama dipertahankan sebagai riwayat. Gunakan keputusan terbaru dan batas Q39 saat menentukan scope tahap awal.
