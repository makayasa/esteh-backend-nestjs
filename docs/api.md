# Kontrak API lokal Esteh

HTTP localhost/LAN tepercaya, data uji saja. Write memakai JSON (kecuali upload gambar biner) dan header
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
  Kuantitas mutasi mengikuti scale ini; API master tidak menerima saldo.
  Katalog material tidak memuat stok; saldo/ledger khusus admin.

Write memakai audit/idempotency atomik yang sama. Produk tidak punya field stok,
modifier, bundling atau resep. Harga historis dan penolakan harga dari client
terbukti pada penjualan; perubahan katalog tidak mengubah snapshot.

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
  karyawan (Q12). Input susulan admin memakai `/sales/backfill` (#13).

## QRIS dan bukti privat (#10–#12)

`POST /sales` menerima field opsional `method: 'cash' | 'qris'` (default
`cash`). Penjualan QRIS tercipta tanpa penerimaan: status `pending`,
`receipt` null, tidak masuk penjualan lunas/penerimaan terkonfirmasi (Q10).
Retry identik idempoten seperti tunai.

- `POST /sales/:id/evidence` (Q27): body biner `image/jpeg`, `image/png`,
  atau `image/webp`, maksimal 5 MB (413 bila lebih). Isi file divalidasi
  dengan decode/re-encode, maksimal 20 juta piksel, hanya still image. Metadata
  tidak disalin, bukan hanya pemeriksaan magic byte.
  File disimpan privat pada volume (`EVIDENCE_DIR`, default `uploads`),
  tidak pernah tautan statis; unduhan lewat `GET /sales/:id/evidence`
  dengan izin transaksi yang sama dengan detail penjualan (pemilik hari WIB
  berjalan atau admin; di luar itu 404, bukan 403). Upload bukti saja tidak
  melunasi penjualan. File ditulis sebelum referensi DB dibuat, jadi
  kegagalan tulis tidak menghasilkan referensi bukti rusak.
- `POST /sales/:id/confirm`: konfirmasi manual setelah pemeriksaan merchant.
  Karyawan wajib mengunggah bukti dulu; admin tanpa bukti wajib menyertakan
  `reason` (1..500) dan `merchantRef` (1..128), keduanya tersimpan pada
  penerimaan. Penerimaan QRIS sebesar total backend tercipta atomik dengan
  audit/idempotency; dua konfirmasi konkuren hanya menghasilkan satu
  penerimaan (lock baris penjualan), konfirmasi kedua 409. `receivedAt` opsional
  menyimpan waktu dana diterima (ISO8601 berzona waktu); `confirmedAt` dari server
  terpisah. Default receivedAt = waktu konfirmasi bila tidak diberikan.

Penghapusan otomatis bukti tidak ada pada MVP (Q27); kapasitas disk dipantau
operator.

## Koreksi, pembatalan, refund, input susulan (#13–#19, P6)

Keempat operasi berikut hanya admin (karyawan 403), idempoten via header
Idempotency-Key, dan tercatat audit. Tidak ada jalur lain yang mengubah
penjualan; catatan lunas tidak diedit/dihapus (Q11) — koreksi membuat
catatan pengganti yang menunjuk catatan lama (`correctsId`), catatan lama
menyimpan `correctedById` dan penerimaan aslinya tetap terbaca sebagai
riwayat. Penjualan pengganti tidak dapat dikoreksi lagi; satu koreksi per
catatan.

- `POST /sales/backfill` (Q12/Q23): input susulan dengan waktu kejadian asli
  (`occurredAt` wajib, tidak boleh di masa depan), petugas (`occurredBy`),
  referensi catatan manual (`manualRef`), alasan, dan harga historis
  `unitPrice` per item. Metode default cash; penerimaan cash dicatat pada
  waktu uang diterima (Q21). Metode qris mengikuti alur konfirmasi P5.
- `POST /sales/:id/correct`: item pengganti wajib menyertakan `unitPrice`
  (harga historis beralasan) dan `reason`. Penerimaan efektif mengikuti
  total backend tanpa membuat uang kedua — laporan efektif menghitung
  catatan pengganti saja. Pengganti memiliki occurredAt/waktu terima asli.
  Koreksi metode menjadi QRIS (termasuk QRIS→QRIS) wajib `merchantRef`
  serta foto terikat atau `evidenceUnavailableReason` (alasan khusus bukti tidak
  tersedia, bukan alasan koreksi biasa). Pengecualian dan referensi disimpan;
  foto lama tetap terikat pada revisi baru.
- `POST /sales/:id/cancel`: wajib `reason`; bila lunas wajib `settlement`
  menjelaskan penyelesaian uang. Ini bukan instruksi pengembalian otomatis.
  Penjualan pending yang belum
  dibayar dibatalkan tanpa refund; penjualan lunas tetap menyimpan
  penerimaannya — dana yang pernah diterima tidak hilang dari catatan dan
  refund dicatat terpisah. Penjualan yang sudah dikoreksi/batal ditolak 409.
- `POST /sales/:id/refund`: hanya penuh, nominal selalu sama dengan
  penerimaan aktual (trigger DB menolak selisih); `method` = metode aktual
  pengembalian, `occurredAt` = waktu uang dikembalikan (Q21), wajib alasan.
  Refund atas penjualan pending (belum lunas) ditolak; ganda ditolak 409;
  koreksi biasa setelah refund ditolak. Penjualan lunas tetap berstatus
  `paid` dengan blok `refund` pada detail.

Status penjualan: `pending` (QRIS belum dikonfirmasi), `paid`, atau
`cancelled`. Dua operasi konkuren pada penjualan yang sama (koreksi/refund)
hanya menghasilkan satu efek; yang lain 409.

## Stok, pembelian, pengeluaran (#20–#25)

Seluruh route ini khusus admin, termasuk GET. Semua POST memakai Idempotency-Key.
Tidak ada penerimaan kedua, hard-delete, retur/refund pemasok atau penyusutan.

- `POST /purchases`: `{items:[{materialId,name,quantity,cost}],occurredAt?}`.
  Pembelian lunas/diterima sekaligus. `cost` total rupiah per baris (1..1e9),
  bukan unit cost; `materialId:null` berarti alat, quantity integer tanpa stok.
  Bahan menambah quantity sesuai satuan/scale tepat sekali.
- `POST /purchases/:id/correct`: `{items,reason}`; revisi menggantikan jumlah/nilai
  lama atomik, ditolak bila saldo akhirnya negatif. Alasan tersimpan pada revisi.
- `POST /stock/usage` dan `/stock/waste`: `{materialId,quantity,reason,occurredAt?}`.
- `POST /stock/adjustment`: `{materialId,delta,reason,occurredAt?}`. Delta bertanda,
  bukan saldo absolut; nol ditolak. Stok tidak boleh negatif.
- `POST /stock/ledger/:id/correct`: `{delta,reason}`; delta koreksi terhadap ledger
  lama, bukan penghapusan. Entri koreksi tidak dapat dikoreksi lewat route ini.
- `POST /expenses`: `{category,amount,note?,occurredAt?}`; rupiah integer1..1e9.
- `POST /expenses/:id/correct`: `{category,amount,note?,reason}`.
- `GET /purchases`, `/expenses`, `/stock?materialId=<id>` menerima `page` (50/halaman).
  Riwayat lama tetap ada; laporan memakai revisi efektif.
- `GET /stock/balances`: saldo; DB menyimpan integer quantity×10^quantityScale,
  API stock/delta berupa satuan asli dan stockMicros/deltaMicros integer tersimpan.

Timestamp input wajib ISO8601 dengan `Z` atau offset, tahun2000 ke atas dan tidak
melewati waktu server (toleransi60detik). Default server bila field opsional hilang.

## Laporan JSON (#26–#28)

Admin saja, GET `/reports/sales`, `/reports/payments`, `/reports/costs` dengan
`from=YYYY-MM-DD&to=YYYY-MM-DD&page=1`. Kedua tanggal inklusif menurut WIB;
query DB menggunakan [00.00 WIB from,00.00 WIB setelah to). Maksimum366hari.
Daftar50/halaman, agregat seluruh rentang tidak berubah mengikuti page.

- sales: `total` Penjualan Lunas Bruto, `count`, `products[{productId,quantity,amount}]`,
  `items[{id,occurredAt,amount}]`. Revisi efektif, pending/batal dikecualikan;
  refund tidak mengurangi bruto.
- payments: `cash`, `qris` menurut receivedAt, `refund` menurut waktu uang kembali,
  daftar receipts/refunds dan pending terpisah. `pendingCount`/pending memakai
  tanggal penjualan. Pembatalan tidak menghapus uang yang pernah diterima.
- costs: `purchasesTotal`, `expensesTotal`, count dan daftar tiap jenis; revisi
  efektif, tanggal kejadian asli. Refund bukan biaya. Tidak ada metrik laba/laci.

Contoh sintetis:

```json
{"items":[{"productId":"ID-produk","quantity":2}],"method":"qris"}
```

1. Buat sale dengan body di atas dan simpan ID hasil.
2. POST bytes foto ke `/sales/<id>/evidence` dengan MIME benar, key baru.
3. Periksa merchant, lalu POST `{}` ke `/sales/<id>/confirm` (foto wajib untuk
   karyawan). Admin tanpa foto memakai reason dan merchantRef.
4. Timeout: ulang payload dan key yang sama, jangan membuat sale baru. Izin tetap
   diperiksa; token dicabut401, objek di luar hari/izin404 bahkan untuk retry lama.

Error validation400, unauthorized401, admin-required403, objek tersembunyi404,
key conflict409, body besar413, login limit429, internal500 generik. Gunakan key
baru hanya untuk operasi bisnis berbeda, bukan mengakali conflict.

## Integrasi mobile dan batas operasional

Token mobile wajib disimpan pada secure storage perangkat (Keychain/Keystore),
bukan log/URL/plain preferences. HTTP hanya localhost/LAN tepercaya dan data uji.
Tidak ada bypass validasi TLS untuk deployment berikutnya. Volume bukan backup;
HTTPS, backup eksternal/restore dan notifikasi belum disertifikasi. Orphan gambar
rollback memakai nama unik, tidak menimpa bukti; tidak ada auto-delete bukti.
Operator memantau disk, misalnya `docker compose exec app df -h /app/uploads`.

## Verifikasi

`npm run test:api` membuat PostgreSQL container sintetis terisolasi dengan port
loopback acak, menerapkan migration, menjalankan CLI/HTTP, dan menghapus hanya
container/volume uji miliknya. Perlu Docker; kegagalan Docker membuat check gagal,
bukan skip. `npm run verify` tetap gate unit/e2e dasar; tidak menggantikan check DB.
