# Pengerjaan GitHub issues #3–#7

Status: #3/#4/#5/#7 selesai lokal dengan evidence harness. Master #6 tersedia;
acceptance harga historis/payload penjualan belum terbukti, menunggu #8.
Issue GitHub aktual menjadi rincian acceptance, bukan nomor draft lama.
Keputusan Q1–Q39 dan canonical plan MVP tetap berlaku.

## Urutan dan dependensi

- #3 setelah #1: bootstrap admin/login dan guardrail P1 pada write pertama.
- #4 setelah #3: idle/absolute expiry, logout; waktu terkendali.
- #5 setelah #4: pengelolaan akun, revoke semua session, audit/idempotency.
- #6 dan #7 setelah #5: katalog Produk Jual dan master Bahan Baku/Kemasan.
- #2 sudah menghasilkan navigasi Graphify; bukan dependensi runtime.
- Maksimal satu tracker in_progress per branch; milestone P1/P2/P3 tidak
  otomatis passing hanya karena salah satu issue selesai.

## Batas implementasi

Gunakan NestJS/Prisma/PostgreSQL yang sudah ada. Tidak menambah Redis/service,
repository generik, UI, stok minuman, resep, modifier, atau registrasi publik.
Swagger terlindungi sejak diperkenalkan, bukan sekadar tombol Authorize.
Bootstrap lokal menerima password tanpa command-line argument/log/default bersama.
Password Argon2id, token CSPRNG, hanya hash token session di PostgreSQL.

Login pada issue #3 secara eksplisit membutuhkan transaksi/audit/idempotency.
Kontrak replay token perlu ditetapkan sebelum kode: tidak boleh menyimpan token
mentah dalam hasil idempotency; tidak boleh membuat session kedua pada retry.
Opsi teknis yang memenuhi: token pseudorandom berasal dari HMAC secret lokal
(diluar DB) dan nonce session acak, sehingga replay sesudah verifikasi credential
merekonstruksi token tanpa menyimpan token mentah. Secret harus stabil dan tervalidasi;
perubahan secret mencabut token lama. Dokumentasikan tradeoff sebelum diterapkan.

Nominal Produk Jual berupa rupiah integer dengan batas eksplisit; daftar pagination.
Bahan/Kemasan punya satu satuan tetap; perubahan satuan dilarang, bukan reinterpretasi
stok. Tidak menambahkan tabel transaksi penjualan/stok untuk sekadar memenuhi test
riwayat #6/#7; kaitan riwayat nyata diuji lagi ketika #8/#20 tersedia.

## Seams pengujian yang diajukan

Pengguna menyetujui empat seams berikut pada sesi lanjutan; test boleh ditulis:

1. CLI bootstrap admin lokal: keberhasilan, input invalid, dan penolakan bootstrap
   berulang; tanpa password pada argv/log.
2. HTTP publik login/session/logout/accounts/catalog dengan PostgreSQL terisolasi
   nyata: sukses/gagal, role, validation, retry identik/konflik, concurrency, rollback.
3. Request HTTP dengan waktu terkendali pada batas idle 12 jam/absolut 7 hari;
   tanpa menunggu waktu nyata atau menguji private method.
4. Audit DB untuk invariant keamanan yang tidak terlihat lewat HTTP: token hanya
   hash, tidak ada secret audit, serta audit/mutasi/idempotency atomik.

## Risiko dan verifikasi

- Replay login tidak boleh mengembalikan token sebelum credential/akun diperiksa;
  token dari session revoked/expired tidak boleh dibangkitkan sebagai akses valid.
- Race reset/nonaktif versus request write harus berserial pada row akun/session.
- Uji rollback PostgreSQL nyata; mock Prisma bukan bukti atomisitas.
- Satu slice perilaku per iterasi red/green; bukan semua tabel/test sekaligus.
- Tiap issue menyimpan progress baru, tracker/handoff, `npm run verify`, checks DB,
  `harness:index`, `harness:check`. Diff gate menunggu commit base; jangan membuat
  commit/push/deploy tanpa instruksi eksplisit.
