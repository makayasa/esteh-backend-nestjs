# Handoff — p0-local-runtime

- Branch: `main`, belum ada commit; semua file repo masih untracked.
- Feature: `p0-local-runtime`, `passing` setelah evidence issue #2.
- Plan: `docs/plans/mvp-implementation-plan.md` bagian P0.
- Scope sesi: rekonsiliasi draft tiket 01, bukan provisioning draft tiket 02.
- Latest progress: `harness/progress/2026-09-19-issue-02-graphify.md`.
- Runtime evidence: `harness/progress/2026-09-19-p0-local-runtime-reconciliation.md`.

## Verified Now

- Compose context bersih tanpa node_modules/dist/generated/cache/env repo, volume
  baru: build/startup/migration pertama lulus; app + PostgreSQL nyata healthy.
- Migration replay dua kali tidak punya pending migration; satu record selesai.
- DB stop: health HTTP 503 body langsung `{status: 'degraded', database: 'down'}`
  (88 ms); Docker menjadi unhealthy. DB start memulihkan readiness tanpa restart app.
- Restart dan down/up tanpa `-v` mempertahankan row sintetis pada volume.
- Port aplikasi `127.0.0.1:3000`; DB tidak dipublikasikan. Port host custom 3107 lulus.
- Image berjalan tanpa Graphify dan tanpa `.env` tertanam; image digest dipin.
- `npm run verify` exit 0: 11 tracker valid, tooling tests 13/13, build/lint,
  unit 1/1 dan e2e 2/2. Warning resolver Vitest non-fatal masih ada.

## Changed

- Health e2e awal direproduksi gagal (`body.message` undefined); sekarang memeriksa
  body langsung dan memakai TCP loopback terisolasi untuk simulasi DB-down.
- Docker build awal gagal `EALLOWSCRIPTS`; hapus env npm yang konflik dengan
  allowScripts package. `.dockerignore` kini menyertakan source, mengecualikan cache.
- Generate Prisma tanpa DATABASE_URL; deploy tetap memerlukan URL/koneksi DB.
- Compose memisahkan HOST/PORT dalam container dari publikasi host; field DB wajib.
- Health query/koneksi dibatasi 2 detik, client disconnect saat module destroy.
- README/.env.example menjelaskan lifecycle, migration, bind, keamanan Q39,
  serta gap Graphify. Tracker/quality/progress/index diperbarui.

## Broken Or Unverified

- Graphify tersedia: generate ulang, query/path health, audit allowlist/output lulus.
  58 nodes/71 edges dari 12 file; raw AST memiliki 17 unresolved endpoint edges
  yang diabaikan builder. Dokumen hanya heading; graph bukan dependency map lengkap.
- Diff gate `--base` belum tersedia karena belum ada commit base/HEAD.
- LAN opt-in tidak dibuka/diuji; backup/restore, foto privat, beban dan domain
  bukan cakupan verifikasi ini. Tidak ada klaim siap produksi/integrasi bisnis.

## Next Best Step

Review evidence issue #1/#2; lanjut issue #3 bootstrap/login sesuai guardrail P1.
Generate ulang graph lewat `uv tool run --from graphifyy==0.9.1 python scripts/build-graph.py`
setelah source berubah. Jangan indeks secret/foto/dump/transaksi nyata.

Project Compose `esteh-p0-validation` sudah `down` tanpa `-v`; tidak ada container
uji berjalan. Volume sintetis tetap ada. Context temporary/log dapat ditemukan
melalui `/tmp/esteh-p0-runtime-path`; `.env` di sana tidak boleh disalin ke evidence.
Container/volume project lain serta `.env` repo tidak diubah. Tidak commit/push/deploy.

## Commands

```bash
npm run verify
npm run harness:index
npm run harness:check
```

Gate penutupan `npm run harness:index` dan `npm run harness:check`: keduanya
exit 0; indeks diregenerasi dan 11 tracker valid (state lint, tanpa diff gate).
Perintah reproduksi DB/runtime ada di progress terbaru.
