# 2026-09-19 — issue-07-materials-and-final

Branch main; feature issue-07-materials; final verifikasi sesi #3–#7.

## Completed

Material master name/unit/quantityScale/active; admin write, employee read-only.
Satuan dan scale 0..3 integer immutable di API dan trigger PostgreSQL. Nonaktif
mempertahankan ID, tidak ada delete, resep/modifier/stok produk jual atau konversi.
Kuantitas mutasi belum diterima endpoint master; domain stok kelak wajib mengikuti
scale ini. OpenAPI body/key/role dan docs/api.md mendokumentasikan semua operasi.

## Verification / evidence

- Red `node scripts/test-api.mjs`: POST /materials 404.
- Green `npm run test:api`: exit 0 pada DB fresh; Gula gram scale 3 berhasil,
  scale 0.5 ditolak 400, employee write 403, update unit/scale 400, nonaktif
  mempertahankan ID/unit/scale. UPDATE SQL langsung unit/scale ditolak trigger.
  FK consumer sintetis tetap menunjuk ID master setelah nonaktif; ini bukan
  implementasi/sertifikasi domain stok. Tiga concurrent replay identik, konflik
  key/payload 409. Seluruh checks #3–#6 tetap lulus.
- `npm run verify`: exit 0, 16 tracker valid, tooling 13/13, build/lint,
  unit 1/1, e2e 2/2. Warning resolver Vitest non-fatal masih ada.
- Graph ulang `uv tool run --from graphifyy==0.9.1 python scripts/build-graph.py`:
  exit 0; 27 file/8475 words, 133 nodes/234 edges; source audit lulus. Raw AST
  unresolved edges bertambah menjadi 46, missing/self-loop/collapse 0; dilaporkan
  jujur sebagai keterbatasan extractor. Tidak ada secret/runtime data di corpus.
- Compose final dari source/context bersih (tanpa generated/node_modules/dist/.env
  repo), secret sintetis baru: `up --build -d --wait --wait-timeout 120` exit 0,
  app+DB healthy, 4 migration applied. CLI bootstrap dalam container dan login/me
  HTTP 200; token tidak dicetak. `migrate deploy` ulang: No pending migrations.
  Restart menjaga Account count=1. Stop DB health 503, start pulih healthy.
  App hanya 127.0.0.1:3109; DB tanpa port publik. `down` tanpa -v sesudah uji.
  Project: esteh-final-validation; context pointer /tmp/esteh-final-runtime-path.

## Broken or unverified

- #6 tetap open/blocked: harga historis dan payload penjualan menunggu #8. Tidak
  membuka cycle dependency native atau membangun sales di luar scope sampai #7.
- P1/P2/P3 aggregate tidak dianggap selesai otomatis; perilaku transaksi hari WIB,
  harga historis, kuantitas mutasi, dan feature domain berikutnya belum ada.
- npm audit 9 advisories (2 low/1 moderate/6 high) pada Prisma/mau dependency tree;
  fix yang ditawarkan downgrade major, tidak diambil tanpa review. Lokal data uji
  saja. Native Argon2 Node 26 experimental. Tidak siap produksi.
- Diff gate --base tidak tersedia: repo belum mempunyai commit base/HEAD.
- Secret SESSION_SECRET wajib baru untuk menjalankan app. .env repo tidak disentuh;
  pengguna mengisinya sendiri mengikuti .env.example. Rotasi mencabut token lama.

## Next

Manager putuskan penempatan acceptance lintas-domain #6 supaya #8 tidak terhambat
secara administratif. Review security/concurrency dan advisory dependency sebelum
publikasi. Jalankan ulang API checks/verify setelah perubahan. Tidak klaim #6 selesai.

## Working tree / commits

Tanpa commit/push/deploy. Test-api menghapus hanya container/volume uji miliknya.
Compose final container/network sudah down, volume sintetis tetap ada. Volume lama
serta .env pengguna tetap utuh. Progress lama tidak diedit. Gate index/check final
dicatat di handoff setelah dijalankan.
