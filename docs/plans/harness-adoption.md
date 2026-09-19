# Adaptasi harness MyXL → Esteh

## Tujuan / referensi

Permintaan pengguna: pelajari harness `/Users/makayasa/Projects/Flutter/myxl-neo-apps`
dan implementasikan pada backend ini. Referensi dibaca tanpa mengubah repo asal:
`AGENTS.md`, `CLAUDE.md` bagian Workflow AI, `harness/README.md`, checklist,
rubric, quality, `tool/harness/harness.dart`, dan `tool/ci/check_harness.sh`.
Query graph referensi membantu menemukan entrypoint; detail diverifikasi
langsung dari file karena hasil graph tidak mencakup seluruh tooling.

## Keputusan adaptasi

- Adopsi shard feature/progress/handoff dan evidence-before-passing.
- Node ESM + built-in test runner menggantikan Dart; tanpa dependency baru.
- Gate NestJS/Vitest menggantikan Flutter analyze/device smoke. Bukti DB nyata,
  HTTP, persistence dan concurrency menggantikan bukti UI bila relevan.
- Plan tetap di `docs/plans/` yang sudah digunakan Esteh, bukan folder
  provider-specific `.kimi-code/`. Instruksi canonical `AGENTS.md`; `CLAUDE.md`
  hanya menunjuknya, agar aturan tidak diduplikasi.
- Seed P0–P9 dari plan dengan baseline `not_started`; perubahan paralel yang
  ditemukan saat verifikasi direkonsiliasi tanpa mengklaim kelulusan. Bootstrap harness adalah tracker
  tersendiri; kelulusannya tidak menyatakan MVP/P0 selesai.
- GitHub Actions mengikuti remote repo ini, bukan menyalin GitLab CI MyXL.
  Tidak memasang hook, branch protection, atau push secara otomatis.
- Tidak menyalin data produk MyXL, file legacy monolit, instruksi pribadi,
  Flutter constraints, maupun rating quality/evidence referensi.
- Graphify tetap pekerjaan P0; tidak menghasilkan graph seluruh repo hanya
  untuk memasang harness.

## Acceptance criteria

1. Agent baru dapat menemukan scope, status, bukti, dan next step dari repo.
2. Validator menolak schema invalid, evidence kosong/palsu-path, dependency
   hilang/cycle, serta lebih dari satu fitur aktif pada branch deklaratif sama.
3. Mode diff menolak perubahan yang memerlukan progress tanpa entri baru,
   menolak perubahan riwayat progress, dan gagal jika base tidak tersedia.
4. Index deterministik; invalid input tidak menimpa indeks lama.
5. Tooling tests dan gate backend dijalankan; hasil dan gap dicatat jujur.
6. Tidak mengubah kode bisnis, keputusan Q1–Q39, atau status P0–P9 menjadi selesai.

## Verifikasi / risiko

Jalankan `npm run verify`; tests tooling memakai temporary repo untuk skenario
Git sehingga tidak memerlukan commit pada repo Esteh. CI runner remote dan
branch protection belum dapat dibuktikan hanya dari local tests. Validator
memeriksa keberadaan evidence, bukan membuktikan semantiknya; reviewer tetap
membandingkan hasil dengan acceptance criteria. Indeks adalah derived file,
regenerasi setelah merge. Next implementation tetap P0 setelah pengguna memilih
untuk melanjutkan; tidak ada pemasangan infra/domain dalam sesi harness.
