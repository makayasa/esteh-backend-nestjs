# 2026-09-19 — p0-local-runtime-reconciliation

- Branch: `main` (belum ada commit).
- Feature: `p0-local-runtime`, tetap `in_progress`.
- Scope: rekonsiliasi draft tiket 01; verifikasi runtime P0 yang sudah ada,
  bukan membuat stack kedua. Canonical acceptance tetap pada plan MVP bagian P0.
- Waktu verifikasi: 13:30–13:38 UTC, 19 September 2026.

## Completed

- Reproduksi health e2e awal: exit 1, 1/2 test gagal karena `res.body.message`
  undefined. Controller memang mengembalikan body langsung untuk exception object.
  `test/app.e2e-spec.ts` sekarang memeriksa `res.body`; DB-down disimulasikan
  dengan server TCP loopback yang menutup koneksi, tidak bergantung pada `.env`
  atau PostgreSQL lain di host. Test menutup server/app dan memulihkan environment.
- Reproduksi build Compose awal: exit 1, `EALLOWSCRIPTS` pada kedua `npm ci`.
  `Dockerfile` menghapus `npm_config_allow_scripts`; memakai `allowScripts`
  yang sudah ada dalam `package.json`.
- `.dockerignore` tidak lagi mengecualikan seluruh `src`; hanya `src/generated`.
  Cache `*.tsbuildinfo` dan state harness tidak ikut build context.
- `prisma.config.ts` tidak mengevaluasi `env('DATABASE_URL')` saat generate;
  client dapat dihasilkan tanpa secret/DB. Deploy tetap memerlukan koneksi valid.
- `docker-compose.yml` memisahkan bind container `0.0.0.0:3000` dari publikasi
  host default `127.0.0.1:${PORT:-3000}`. Sebelumnya HOST localhost dalam
  container tidak dapat dijangkau melalui forwarding Docker; PORT non-default
  juga tidak selaras dengan port target/healthcheck. Variabel DB wajib tidak kosong.
- `src/health/health.service.ts`: timeout koneksi/query 2 detik dan disconnect
  Prisma saat module dihancurkan. Respons tidak memuat detail error koneksi.
- Node/PostgreSQL dipin ke digest image yang benar-benar diuji; lockfile npm
  tidak diubah. README ditulis ulang dalam bahasa Indonesia, kontrak health,
  lifecycle aman tanpa hapus volume, LAN opt-in, dan status P0 yang jujur.
  `.env.example` memperbaiki penjelasan bind dan akses CLI ke DB privat.

## Lingkungan dan isolasi

Docker Desktop 4.91.0, Engine server 29.8.0, Compose 5.5.1, linux/arm64.
Host Node 26.4.0/npm 11.17.0. Image Node 26.9.0/npm 11.19.1,
PostgreSQL 17.11, NestJS 12.0.3, Prisma/adapter 7.10.0, pg 8.23.0,
TypeScript 6.0.3, Vitest 4.1.11. Versi npm dibaca dari log startup image.

Context verifikasi dibuat di direktori temporary dari source/config/lockfile
repo, tanpa `node_modules`, `dist`, generated client, cache build, atau `.env`
repo. `.env` temporary berasal dari `.env.example` dengan password acak sintetis
pada kedua field. Project `esteh-p0-validation` memakai network dan volume baru;
log awal mencatat `db-data`/`uploads` Created. Docker image cache/pull lokal
tersedia; ini bukan klaim host tanpa Docker cache atau uji download offline.

Perintah di bawah memakai alias shell (bukan script atau stack baru):

```bash
DC="docker compose -p esteh-p0-validation --project-directory $P0_DIR -f docker-compose.yml"
```

`P0_DIR` adalah context temporary tersebut. Untuk mengulang, buat context bersih
seperti di atas; jangan gunakan project name yang sudah memiliki data jika ingin
menguji migration pertama. File `/tmp/esteh-p0-runtime-path` menyimpan lokasinya
untuk sesi lanjutan; nilainya bukan bagian konfigurasi project.

## Verification / evidence

| Command / check | Result / exit code | Scope |
| --- | --- | --- |
| `npm run test:e2e` sebelum perubahan | Exit 1, 1 passed / 1 failed | Reproduksi kontrak body salah pada test |
| `$DC up --build -d` sebelum perubahan | Exit 1, `EALLOWSCRIPTS` | Kegagalan nyata clean image build |
| `$DC up --build -d --wait --wait-timeout 120` sesudah fix | Exit 0, app + DB healthy, volume baru | npm ci, generate tanpa `.env`, compile, migration awal, startup |
| `$DC logs --no-color --tail=40 app` | `Applying migration 0001_init`, `All migrations have been successfully applied.` | Migration awal PostgreSQL nyata |
| `curl --fail-with-body --max-time 5 -i http://127.0.0.1:3000/health` | Exit 0, HTTP 200, `{"status":"ok","database":"up"}` | Akses aplikasi dari host melalui port Docker |
| `$DC exec -T app npx prisma migrate deploy` dua kali | Kedua exit 0, `No pending migrations to apply.` | Migration aman diulang |
| Query `_prisma_migrations` | `0001_init\|t\|t` untuk name, finished, not rolled back | Satu migration selesai, tidak rollback |
| `$DC stop db`, lalu HTTP fetch dengan assert dan timeout 5 detik | Exit 0, HTTP 503, `{"status":"degraded","database":"down"}`, 88 ms | DB-down nyata, body tersanitasi |
| Poll `docker inspect ... --format '{{.State.Health.Status}}'` | `unhealthy` sebelum batas 150 detik | Docker readiness mengikuti DB-down; bukan hanya HTTP mock |
| `$DC start db` lalu `$DC up -d --wait --wait-timeout 120` | Exit 0, keduanya healthy | Recovery DB pada app yang sama |
| `$DC restart` lalu wait dan SELECT fixture | Exit 0, `synthetic-p0-persistence` tetap ada | Restart app + DB menjaga row |
| `$DC down` lalu `$DC up -d --wait --wait-timeout 120` dan SELECT fixture | Exit 0, row sama tetap ada, health HTTP 200 | Recreate container memakai volume persisten; tanpa `-v` |
| Inspect app `.HostConfig.PortBindings` | `{"3000/tcp":[{"HostIp":"127.0.0.1","HostPort":"3000"}]}` | Tidak mempublikasikan seluruh interface host |
| Inspect DB `.HostConfig.PortBindings` | `{}` | Tidak ada port DB dipublikasikan |
| `$DC exec -T app sh -c 'test ! -e .env && ! command -v graphify && test ! -e graphify-out'` | Exit 0 | Image berjalan tanpa `.env` tertanam/Graphify/graph |
| Build/up ulang sesudah pin digest | Exit 0, app + DB healthy | Konfigurasi final memakai image terverifikasi |
| `PORT=3107 $DC up -d --wait --wait-timeout 120`, fetch/assert port 3107 | Exit 0, HTTP 200 dan body healthy; dikembalikan ke 3000 | Port host non-default tetap cocok dengan health/container |
| `POSTGRES_PASSWORD='' $DC config --quiet` | Exit 1, `POSTGRES_PASSWORD wajib diisi` | Config wajib kosong ditolak |
| `DATABASE_URL='' $DC config --quiet` | Exit 1, `DATABASE_URL wajib diisi` | Config URL kosong ditolak |
| `test -f graphify-out/graph.json`, `command -v graphify`, `graphify --help` | Graph tidak ada; CLI tersedia/help exit 0 | Generate/query belum terbukti; tidak ada corpus diindeks |
| `npm run verify` dua kali sesudah fix | Exit 0; harness 11 tracker, tooling tests 13/13, build/lint lulus, unit 1/1, e2e 2/2 | Gate dasar, bukan sertifikasi fitur bisnis |
| `$DC down` penutupan | Exit 0; container/network uji dilepas, volume dipertahankan | Tidak meninggalkan service uji berjalan |

Fixture dibuat hanya pada DB verifikasi, bukan schema/migration aplikasi:

```sql
CREATE TABLE p0_runtime_probe (id integer PRIMARY KEY, value text NOT NULL);
INSERT INTO p0_runtime_probe VALUES (1, 'synthetic-p0-persistence');
SELECT value FROM p0_runtime_probe WHERE id = 1;
SELECT migration_name, finished_at IS NOT NULL, rolled_back_at IS NULL
FROM _prisma_migrations;
```

Jalankan SQL melalui `$DC exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`.
Pemeriksaan HTTP DB-down yang dipakai:

```js
import assert from 'node:assert/strict';
const response = await fetch('http://127.0.0.1:3000/health', {
  signal: AbortSignal.timeout(5000),
});
assert.equal(response.status, 503);
assert.deepEqual(await response.json(), { status: 'degraded', database: 'down' });
```

Jalankan dengan `node --input-type=module` setelah stop DB. HTTP e2e regression
runnable tetap berada pada `test/app.e2e-spec.ts`; real-DB checks di atas manual.

## Broken or unverified

- **P0 belum passing:** CLI Graphify tersedia, graph project tidak ada;
  generate/query serta audit corpus/output aman belum dilakukan. Draft tiket 02
  terpisah dari runtime tiket 01; tidak mengambil alih provisioning tersebut.
  README hanya mendokumentasikan prosedur dan batas, bukan mengklaim hasilnya.
- Diff gate `harness:check -- --base` tidak dijalankan: belum ada commit base/HEAD.
  Tidak membuat commit demi meluluskan gate.
- LAN opt-in tidak diaktifkan/dibuka; localhost default dibuktikan. Upload foto,
  invariant domain, beban, backup/restore, dan produksi di luar bukti runtime P0.
- Warning non-fatal Vitest tentang `vite-tsconfig-paths` masih ada; bukan regresi.
- Unit 1/1 masih starter test; e2e/Compose bukan bukti P1–P9 selesai.

## Next

Manager/reviewer meninjau rekonsiliasi draft tiket 01 dan evidence ini.
Worker tiket 02 menyiapkan corpus allowlist kode/dokumen, generate/query Graphify,
dan membuktikan tidak ada secret/foto/data transaksi. Sesudah seluruh acceptance
canonical P0 terbukti, jalankan gate lagi dan baru pertimbangkan `passing`.

## Working tree / commits

Tidak ada commit, push, deployment publik, perubahan layanan eksternal, atau
penghapusan volume. Seluruh file repo masih untracked karena belum ada commit.
`.env` repo, container/volume project lain, progress lama, dan lockfile dipertahankan.
Volume `esteh-p0-validation_db-data` (fixture sintetis) serta
`esteh-p0-validation_uploads` tetap ada; app/DB verifikasi sudah dihentikan melalui
`down` tanpa `-v`. Context temporary dan log build lokal tetap tersedia; jangan
masukkan `.env` temporary ke evidence/Git.

Penutupan memperbarui tracker/evidence, quality, handoff, dan regenerasi indeks;
hasil `harness:index`/`harness:check` dicatat pada handoff setelah dijalankan.
