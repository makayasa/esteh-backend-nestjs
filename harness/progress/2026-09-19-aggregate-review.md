# 2026-09-19 — aggregate-review

Branch aggregate-certification. Awal main e8ea9ea bersih; pekerjaan paralel
memajukan HEAD ke 1f309a4 (P5/P6/P7) selama orientasi. Tidak menimpa perubahan itu.
Scope pengguna diperluas ke seluruh issue; review fondasi didahulukan.

## Review dan bukti

Baseline `npm run verify` + `npm run test:api` exit 0 pada e8ea9ea tidak cukup
membuktikan seluruh perilaku. Review source menemukan tiga regresi nyata:

- Retry sale.create sesudah tengah malam WIB mengembalikan data hari lama.
  Red HTTP 200 expected404. Hook authorizeReplay pada transaksi idempotency
  memeriksa izin objek sebelum replay/conflict; create/upload/confirm memakai
  hook tersebut. Batas hari juga diberi upper bound eksklusif.
- P7 GET stock/purchases/expenses hanya memerlukan login. Red /stock HTTP200
  expected403; test lama bahkan mengharapkan employee balances200. Guard admin
  ditambahkan sesuai Q15; katalog material tidak membocorkan kolom stock.
- P5 sanitizer menerima JPEG empat byte tanpa gambar. Red upload HTTP200
  expected400. Decoder native tidak tersedia di Node; sharp0.35.4 dipin setelah
  peer engine Node>=20.9 diperiksa. Decode/re-encode JPEG/PNG/WebP still image,
  20 juta piksel maksimum, 5MiB input/output, metadata tidak disalin. Nama file
  unik menjaga bukti lama saat transaksi rollback; row sale dikunci saat upload.
  Fixture test lama cuma header palsu, diganti gambar sintetis valid 2x2.

`npm run test:api` pasca-fix exit0 PostgreSQL nyata, mencakup seluruh blok P0–P7
baseline plus negative scope replay, role-read, decoded image metadata. Bukti
rollback upload tambahan memeriksa byte bukti terikat tidak berubah jika audit
insert gagal. Fixture bukan foto/data transaksi nyata.

## Sertifikasi fondasi

Acceptance canonical, bukan seluruh fitur masa depan:
- P1: payload/error, retry/409, concurrent atomic rollback, kontrak tanpa uang
  diserahkan/kembalian terbukti pada CLI/HTTP/DB. Upload decoder kini tervalidasi.
- P2: login/expiry/role/revocation + object/day WIB + revoked replay terbukti;
  stok read/write juga ditolak untuk employee. Reporting harus mewarisi admin gate.
- P3: varian/harga/ketersediaan backend, snapshot sales, unit tetap dan tanpa resep
  terbukti. P4: total satu receipt/replay/backdate/rollback, akses #9 juga terbukti.

P1/P2/P3/P4 dan #9 dapat passing setelah gates final; bukan sertifikasi produksi
atau otomatis menyatakan P5/P6/P7/P8/P9 selesai. Review P6 menemukan gap eksplisit
penyelesaian uang cancel lunas, koreksi QRIS foto/pengecualian, serta replay refund
waktu default. Tetap blocked sampai diperbaiki; P8/P9 belum dibuat.

## Risiko/gate

Harness awal sesudah merge paralel exit1 karena p5/p6/p7 in_progress dependensi
blocked. Akan direkonsiliasi dengan status blocked yang jujur, bukan bypass validator.
9 npm advisories sebelumnya masih backlog; tidak audit-fix major otomatis.
Native Argon2 experimental; pg concurrency deprecation warning non-fatal.
Diff gate committed baseline dijalankan, gagal pada state dependensi tersebut;
perubahan sesi belum commit jadi diff gate tidak mencakupnya. Tidak commit/push/deploy.
