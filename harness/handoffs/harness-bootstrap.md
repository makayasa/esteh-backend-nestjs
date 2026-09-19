# Handoff — harness-bootstrap

- Branch: `main` (unborn; semua pekerjaan belum commit).
- Feature: `harness-bootstrap` (`blocked`).
- Plan: `docs/plans/harness-adoption.md`.
- Latest progress: `harness/progress/2026-09-19-harness-bootstrap.md`.

## Verified Now

Validator 11 tracker, 13/13 tooling tests, tooling lint/format lulus. Build backend,
type-aware lint dan 1/1 unit test lulus. Lihat progress untuk hasil detail.

## Changed

Instruksi lintas-agent, workflow sharded, tracker P0–P9, templates/checklist/rubric,
validator + generator indeks + tests Node, npm gate dan workflow GitHub Actions.

## Broken Or Unverified

Full gate exit 1: health e2e gagal assertion `res.body.message` pada pekerjaan P0
paralel. Backend/Docker/Prisma/README berubah saat sesi; jangan revert/overwrite.
P0 `in_progress`, belum diberi passing oleh sesi ini. CI remote dan branch
protection belum diuji/disetel; diff gate hanya diuji di temporary repositories.

## Next Best Step

Koordinasikan hasil health dengan pemilik P0, lalu rerun full gate. Jika hijau,
catat hasil pada progress **baru**, tautkan evidence dan evaluasi kelulusan
bootstrap. Untuk P0, verifikasi seluruh acceptance criteria sebelum passing.

## Commands

```bash
npm run verify
npm run harness:index
npm run harness:check
# Setelah commit base + HEAD tersedia, untuk committed changes:
npm run harness:check -- --base <base-commit>
```
