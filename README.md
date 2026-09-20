# Esteh Backend (NestJS)

Backend pencatatan operasional satu usaha/satu outlet. Istilah domain:
[CONTEXT.md](./CONTEXT.md). Scope dan acceptance:
[rencana MVP](./docs/plans/mvp-implementation-plan.md).

**Status: backend siap integrasi lokal dengan data uji; bukan siap produksi.**
Identitas, katalog, penjualan tunai/QRIS, bukti privat, koreksi/refund, stok,
pembelian/pengeluaran dan laporan JSON tersedia. Bukti/status akhir:
[handoff agregat](./harness/handoffs/aggregate-certification.md).
Kontrak dan bootstrap: [docs/api.md](./docs/api.md).

## Stack terverifikasi

| Komponen | Versi |
| --- | --- |
| NestJS | 12.0.3 |
| TypeScript / Vitest | 6.0.3 / 4.1.11 |
| Prisma / adapter-pg / pg | 7.10.0 / 7.10.0 / 8.23.0 |
| Node container / tooling host | 26.9.0 / 26.4.0 |
| PostgreSQL | 17.11 (alpine) |

Dependensi npm dikunci melalui `package-lock.json`; gunakan `npm ci`.
Image Node/PostgreSQL dipin dengan digest dalam Dockerfile/Compose.
Prisma memakai driver adapter PostgreSQL; CLI migration ikut image runtime.
Graphify bukan dependensi npm atau image aplikasi.

## Startup lokal dari lingkungan bersih

Prasyarat: Docker dengan Compose v2+; port host 3000 tersedia. Node 26 untuk
checks lokal, tidak diperlukan untuk menjalankan Compose.

1. Salin `.env.example` menjadi `.env` jika belum ada. Jangan timpa konfigurasi lama.
2. Ganti password contoh pada **keduanya**, `POSTGRES_PASSWORD` dan `DATABASE_URL`,
   dengan nilai acak yang sama. Gunakan hex agar aman dalam URL. Hanya data uji;
   jangan simpan `.env` di Git. Jangan mengganti password volume DB lama tanpa
   mengubah password role PostgreSQL juga.
3. Isi `SESSION_SECRET` dengan 32 byte acak hex sesuai `.env.example`; simpan
   stabil di luar DB. Nilai kosong membuat startup ditolak.
4. Jalankan stack:

```bash
docker compose up --build -d --wait --wait-timeout 120
docker compose ps
curl --fail-with-body http://127.0.0.1:3000/health
```

Startup menunggu DB sehat, menjalankan `prisma migrate deploy`, lalu NestJS.
Variabel DB wajib diisi; Compose menolak nilai kosong. URL/koneksi DB invalid
menggagalkan migration dan mencegah aplikasi mulai. Build tidak memerlukan
`.env` atau DB dan tidak menyertakan `.env` dalam image.

| Endpoint | Respons |
| --- | --- |
| `GET /` | HTTP 200, `Hello World!` |
| `GET /health` dengan DB tersedia | HTTP 200, `{"status":"ok","database":"up"}` |
| `GET /health` tanpa DB | HTTP 503, `{"status":"degraded","database":"down"}` |

Body health langsung, bukan dibungkus `message`. Docker healthcheck memakai
endpoint yang sama; perubahan status container menunggu interval/retry check.

## Stop, restart, migration, dan persistensi

```bash
docker compose exec app npx prisma migrate deploy  # aman diulang
docker compose restart                            # volume tetap ada
docker compose down                               # stop/hapus container, volume tetap ada
docker compose up -d --wait --wait-timeout 120
```

Jangan gunakan `docker compose down -v` untuk stop biasa: opsi `-v` menghapus
volume beserta datanya. Volume bukan backup; RPO/RTO belum dijamin.

Uji readiness hanya pada stack lokal dengan data uji:

```bash
docker compose stop db
curl -i --max-time 5 http://127.0.0.1:3000/health  # HTTP 503
docker compose start db
docker compose up -d --wait --wait-timeout 120   # kembali healthy
```

Migration bootstrap diikuti schema domain dan migration review additive. Untuk membuat migration saat development,
jalankan `npx prisma migrate dev --name <nama>` dari workspace yang dapat mengakses
DB development terisolasi; jangan arahkan ke DB berisi transaksi nyata. Compose
normal tidak membuka DB ke host. Mengganti hostname menjadi `localhost` saja tidak
membuat DB dapat diakses. Client `src/generated/` diabaikan Git dan dibuat ulang
oleh `npm run build`.

## Bind localhost dan LAN

- `HOST=127.0.0.1` mengatur **publikasi port host** Compose. `PORT=3000`
  mengatur port host; container tetap memakai port 3000.
- Di dalam container aplikasi mendengar pada `0.0.0.0:3000`, agar port forwarding
  Docker bekerja. Ini tidak membuka semua interface host.
- LAN opt-in: isi `HOST` dengan IP LAN host, lalu recreate melalui
  `docker compose up -d`. Gunakan LAN tepercaya, firewall, dan data uji.
  `HOST=0.0.0.0` mempublikasikan seluruh interface host; jangan gunakan pada host
  yang dapat diakses publik tanpa pembatasan jaringan.
- PostgreSQL tidak mempublikasikan port, termasuk saat LAN diaktifkan.
- Menjalankan NestJS langsung memakai `HOST`/`PORT` sebagai bind proses;
  default `127.0.0.1:3000`.

Q39 hanya mengizinkan localhost/LAN tepercaya dengan data uji. Jangan membuka
HTTP publik atau memakai kredensial/data nyata. Domain, IP publik, HTTPS,
backup eksternal, dan notifikasi bukan syarat startup lokal.

## Checks lokal

```bash
npm ci
npm run verify       # harness, build, lint, unit, HTTP e2e
npm run test:api      # CLI/HTTP/clock/audit pada PostgreSQL fresh (perlu Docker)
npm run test:load     # suite di atas + 1.000 sales, 10 pengguna bersamaan
npm run harness:index
npm run harness:check
```

HTTP e2e memakai endpoint TCP lokal yang menutup koneksi untuk mensimulasikan
DB tidak tersedia, bukan DB dari `.env`. Bukti PostgreSQL nyata, migration,
restart, dan bind dicatat terpisah pada progress. `harness:check -- --base <commit>`
hanya memeriksa committed diff; perubahan working tree belum tercakup.

## Graphify (development)

Generator `scripts/build-graph.py` memakai Graphify 0.9.1. Gunakan interpreter
Python environment yang memasang Graphify, bukan dependency image aplikasi:

```bash
uv tool install graphifyy==0.9.1  # hanya jika belum terpasang
uv tool run --from graphifyy==0.9.1 python scripts/build-graph.py
graphify query "health controller service"
graphify path "HealthController" "HealthService"
```

Allowlist: `src/**/*.ts` tanpa `generated`, `test/**/*.ts`, `CONTEXT.md`, keputusan
MVP dan plan implementasi. Generator menyalin hanya file tersebut ke corpus
sementara, menolak symlink dan pola credential umum, lalu mengaudit seluruh
`source_file` output terhadap allowlist. Review source sebelum generate: scanner
pola bukan jaminan mendeteksi semua secret. Jangan masukkan secret/data nyata ke
source/test. `.env`, foto, dump DB, uploads, dan runtime data tidak dibaca.

Output lokal, gitignored: `graphify-out/graph.json`, `manifest.json`, dan
`GRAPH_REPORT.md`. Manifest menyimpan corpus dan diagnostics; tidak ada API LLM
atau layanan eksternal. Kode memakai AST, dokumen hanya heading/containment:
ini bukan pencarian semantik penuh. Manifest/report mencatat jumlah edge simbol
unresolved yang diabaikan Graphify saat build. Jangan menganggap graph
lengkap. Query health terverifikasi; selalu cek source aktual sebelum mengedit.
Runtime Compose sudah diuji tanpa Graphify. Regenerate setelah source berubah.
