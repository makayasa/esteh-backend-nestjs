# Kontrak API lokal Esteh

HTTP localhost/LAN tepercaya, data uji saja. Semua write memakai JSON dan header
`Idempotency-Key` (8–128 karakter, unik per pelaku/operasi). Bearer token di header
`Authorization`, tidak pada URL/log. Payload field asing ditolak. Body maksimal
16 KiB. Error internal generik; tidak ada SQL/credential dalam response atau log.

## Bootstrap dan login (#3)

Build dan migrate terlebih dahulu. CLI `node dist/bootstrap-admin.js` membaca satu
objek JSON `{ "username": "...", "password": "..." }` melalui stdin, bukan argv.
Gunakan password manager untuk pipe atau file sementara mode 0600 lalu hapus secara
aman. Jangan memasukkan password nyata pada shell history. Tidak ada password default,
registrasi HTTP, atau bootstrap ulang setelah akun pertama ada. Bootstrap diaudit.
Username: 3–64 karakter `[a-z0-9._-]`; password 12–128 karakter.

`SESSION_SECRET` wajib 32 byte acak, hex 64 karakter. Generate lokal dengan
`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`,
simpan hanya pada `.env` lokal/secret runtime, bukan DB/Git. Rotasi menggagalkan
verifikasi token lama. Password memakai Argon2id v19, m=19456 KiB, t=2, p=1,
salt acak 16 byte dan hash 32 byte; implementasi native Node 26 (API experimental).

- `POST /auth/login`: username/password; HTTP 200 `{ "token": "..." }`.
- `GET /auth/me`: Bearer; HTTP 200 `{ "id", "username", "role" }`.
- Login salah/nonaktif/tidak dikenal: HTTP 401 generik.
- Rate limit PostgreSQL: 10 percobaan/username dan 50/IP per 15 menit, termasuk
  sukses/retry; HTTP 429. Proxy header tidak dipercaya; tanpa external limiter.
- Retry login key sama/payload sama: satu session, token sama. Payload berbeda:
  HTTP 409 setelah kredensial diverifikasi; kredensial invalid tetap 401.
- Token 256 bit adalah HMAC-SHA256(secret runtime, nonce session UUID acak).
  DB menyimpan SHA256(token), nonce/ID, bukan token mentah atau ciphertext token.
  Replay login memverifikasi password/akun/session sebelum rekonstruksi token.
  Hanya hasil ID session yang disimpan pada idempotency; fingerprint credential
  memakai HMAC dengan secret yang tidak berada di DB. Kompromi DB + secret runtime
  tetap kompromi session; perlakukan secret sebagai kunci keamanan.
- Session + audit + idempotency commit/rollback bersama. Row lock akun mencegah
  concurrent login retry menggandakan efek.

## OpenAPI/Swagger

`GET /docs/openapi.json` dan `/docs` membutuhkan Bearer admin, termasuk assets UI.
Ambil JSON dengan client HTTP terautentikasi dan impor ke tooling Swagger. Halaman
browser biasa tanpa header akan 401; tombol Authorize bukan pelindung dokumen.
Login memiliki schema payload pada dokumen. Kontrak tambahan ditambahkan per issue.

## Session dan akun (#4–#5)

Session habis saat idle >= 12 jam atau usia >= 7 hari. Aktivitas tidak memperpanjang
batas absolut. `POST /auth/logout` body `{}` mencabut session terkait; retry dengan
token dicabut tetap 401 karena autentikasi mendahului replay. Reset password dan
nonaktif mencabut semua session akun target.

Admin saja:
- `POST /accounts`: `{ username, password, role }`, role `admin` atau `employee`.
- `GET /accounts?page=1`: `{ items }`, 50 item/halaman, tanpa passwordHash.
- `POST /accounts/:id/reset-password`: `{ password }`.
- `POST /accounts/:id/deactivate`: `{}`. Nonaktif diri sendiri ditolak.

Semua mutasi HTTP 200, header Idempotency-Key wajib. Payload berbeda/key sama
409; akun/token nonaktif tetap 401 sebelum replay. Password di fingerprint HMAC,
bukan hasil idempotency/audit. Tidak ada hard-delete akun.

## Katalog (#6–#7)

Karyawan/admin boleh membaca; hanya admin boleh menulis. List memakai `page`
integer 1..999999, 50 item, urutan ID stabil, respons `{ items, page, pageSize }`.
Tidak ada DELETE. Nonaktif mempertahankan ID; list masih memuat master nonaktif.

- `GET /products`; `POST /products`: `{ name, price, available }`.
- `POST /products/:id`: `{ name, price, available, active }`.
- Harga rupiah integer JSON 1..1_000_000_000 (CHECK PostgreSQL juga berlaku),
  bukan float. Regular/Jumbo merupakan ID produk berbeda. Nama 1..120 karakter.
- `GET /materials`; `POST /materials`: `{ name, unit, quantityScale }`.
- `POST /materials/:id`: `{ name, active }` saja. Unit/presisi pada update ditolak.
- Unit kode 1..24 karakter `[a-z][a-z0-9_-]*`, contoh `gram`, `pcs`.
  `quantityScale` integer 0..3 menetapkan jumlah desimal maksimal, immutable
  bersama unit (termasuk trigger DB). Tidak ada konversi satuan otomatis.
  Nilai kuantitas belum diterima API master; validasi nominal kuantitas mutasi
  harus mengikuti scale ini ketika modul stok #20/#21 dibuat.

Write memakai audit/idempotency atomik yang sama. Produk tidak punya field stok,
modifier, bundling atau resep. Harga historis penjualan dan validasi payload
penjualan #6 baru dapat dibuktikan end-to-end pada issue #8; #6 belum ditutup.
Referensi material dibuktikan dengan FK sintetis; bukan klaim modul stok selesai.

## Penjualan tunai (#8)

Karyawan dan admin boleh mencatat penjualan; lihat transaksi terbatas izin.
`POST /sales`: `{ "items": [{ "productId", "quantity" }] }` saja. Field uang
(total, harga, uang diserahkan, kembalian) dan field tanggal tidak diterima;
payload asing ditolak 400. Harga adalah snapshot katalog saat pencatatan dan
total dihitung backend; satu penerimaan tunai sebesar total tercipta atomik.
Quantity integer 1..10000 per item; nominal tetap rupiah integer
1..1_000_000_000. Trigger DB menolak penerimaan yang nominalnya tidak sama
dengan jumlah unitPrice × quantity penjualan terkait.

- `GET /sales?page=1`: 50 item/halaman. Admin melihat semua; karyawan hanya
  transaksi sendiri pada hari WIB berjalan (00.00 WIB, Q22).
- `GET /sales/:id`: detail dengan snapshot item dan penerimaan; akses di luar
  izin/hari berjalan menghasilkan 404, bukan 403, agar tidak membocorkan ID.
- Retry identik (key sama, payload sama) mengembalikan penjualan yang sama;
  payload berbeda dengan key sama 409. OccurredAt/recordedAt/receivedAt dari
  server. Penjualan normal: waktu kejadian = waktu input; pelaku input adalah
  petugas yang mencatat (Q12). Input susulan admin (P6) memisahkan keduanya.
- Detail respons: `{ id, occurredAt, recordedAt, recordedBy, items, total,
  receipt }`. occurredAt = waktu kejadian; recordedAt/recordedBy = waktu dan
  pelaku input/pencatatan.
- Pergantian hari WIB diuji dengan waktu terkendali pada 00.00 WIB: penjualan
  sebelum tengah malam keluar dari akses karyawan tepat setelah berganti hari.
- Pencatatan tunai tidak mengurangi bahan otomatis (Q18); tidak ada backdate
  karyawan (Q12). Input susulan admin adalah bagian issue #10/#12 (P6).

## Verifikasi

`npm run test:api` membuat PostgreSQL container sintetis terisolasi dengan port
loopback acak, menerapkan migration, menjalankan CLI/HTTP, dan menghapus hanya
container/volume uji miliknya. Perlu Docker; kegagalan Docker membuat check gagal,
bukan skip. `npm run verify` tetap gate unit/e2e dasar; tidak menggantikan check DB.
