# 2026-09-19 — issue-02-graphify

- Branch: main, belum commit.
- Feature: p0-local-runtime; melengkapi issue GitHub #2 setelah #1 closed.
- Scope: Graphify development, bukan runtime atau semantic LLM service.

## Completed

`scripts/build-graph.py` memakai Graphify 0.9.1, corpus temporary dari allowlist
12 file: source/test TS tanpa generated, CONTEXT, keputusan MVP, plan implementasi.
Menolak symlink/path keluar root dan pola credential umum; seluruh source_file
output wajib bagian allowlist. README mencatat generate/query, batas ekstraksi,
dan audit. Tidak membaca .env, uploads, database/dump, foto, atau transaksi nyata.

## Verification / evidence

- `uv tool run --from graphifyy==0.9.1 python scripts/build-graph.py`: exit 0,
  diulang, 12 file / 5463 words; 58 nodes / 71 edges; source audit passed.
- `graphify query 'health controller service' --budget 900`: exit 0, 12 node;
  HealthService src/health/health.service.ts:L6 dan HealthController
  src/health/health.controller.ts:L5 sesuai source aktual.
- `graphify path HealthController HealthService`: exit 0, dua hop melalui
  health.controller.ts, hubungan contains/imports EXTRACTED.
- Audit semua source_file dibanding allowlist lulus; output tidak berisi pola
  URL koneksi PostgreSQL/private key/AWS credential. Tidak ada path .env,
  uploads/foto, dump atau data transaksi pada manifest. Scanner bukan bukti
  semua pola secret dapat dideteksi; corpus adalah source uji yang sudah dibaca.
- `npm run verify`: exit 0, tooling 13/13, unit 1/1, e2e 2/2, build/lint lulus.
- Runtime tanpa Graphify dibuktikan progress rekonsiliasi P0 sebelumnya.

## Broken or unverified

Percobaan pertama script bernama graphify.py membayangi package; diperbaiki
menjadi build-graph.py. Diagnostic raw AST mendeteksi 17 dangling endpoint edges,
0 missing endpoint, 0 self-loop, 0 same-endpoint collapse. Asersi tanpa dangling
sempat gagal; laporan kini mengungkap keterbatasan extractor, bukan menyembunyikan.
Graph output tidak memiliki dangling endpoint: builder mengabaikan edge unresolved.
Dokumen hanya heading/containment, bukan semantic inference. Tidak mengklaim graph
lengkap. LLM tokens 0. Output graph/manifest/report lokal gitignored dan reproducible.

## Next

P0 acceptance runtime + Graphify terpenuhi; tracker P0 passing. Mulai issue #3
setelah menyelaraskan guardrail login/idempotency dan batas pengujian PostgreSQL.
Issue #4–#7 tetap belum dikerjakan dan tidak dianggap selesai.

## Working tree / commits

Tidak commit/push/deploy. Source lama/secret/volume tetap utuh; progress lama tidak
diubah. Issue #2 diklaim lewat gh; evidence tersimpan lokal, belum tersedia di remote.
