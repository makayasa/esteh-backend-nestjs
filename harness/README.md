# Harness — operasi agent Esteh

Adaptasi pola sharded MyXL Neo: kerja terbaca, bisa diverifikasi, dan bisa
dilanjutkan tanpa konteks percakapan lama. `docs/` menyimpan keputusan/plan;
`harness/` menyimpan state aktual. Aturan project: [AGENTS.md](../AGENTS.md).

## Artefak

| Path | Pemakaian |
| --- | --- |
| `features/<id>.json` | Satu tracker per fitur; ID sama dengan nama file |
| `progress/YYYY-MM-DD-<slug>.md` | Satu file baru per sesi; riwayat append-only |
| `handoffs/<tiket>.md` | Snapshot tiket; overwrite saat menutup sesi |
| `INDEX.md` | Generated lewat `npm run harness:index`; bukan sumber kebenaran |
| `templates/` | Format progress/handoff, disalin dan diisi tanpa placeholder |
| `quality.md` | Baseline dan gap codebase, bukan klaim siap produksi |
| `clean-state-checklist.md` | Gate penutupan sesi |
| `evaluator-rubric.md` | Review output sesi terhadap scope dan bukti |

Gunakan slug tiket stabil, bukan nama branch mentah yang mungkin mengandung
`/`. Jika ada dua sesi pada tanggal/tiket yang sama, tambahkan suffix unik pada
progress. Handoff menyebut branch dan feature ID; arsipkan keputusan dalam
progress sebelum menghapus handoff tiket yang sudah merge. Indeks boleh
mengalami konflik lintas-branch: resolve dengan regenerasi dari shard.

## Alur dan status

1. **Orientasi**: baca handoff + tracker. Jika belum ada, buat dari template.
   Untuk MVP, acceptance criteria tetap bersumber dari plan P0–P9; jangan
   menyalin daftar acceptance criteria menjadi versi kedua.
2. **Planning**: tulis plan di `docs/plans/`; pecah pekerjaan besar menjadi
   task terverifikasi. Tandai asumsi/keputusan yang masih terbuka.
3. **Implementasi**: set tracker ke `in_progress` dan isi `branch` aktual.
   Maksimal satu tracker `in_progress` untuk branch yang sama. Dependensi
   harus `passing` sebelum implementasi dimulai (planning boleh lebih awal).
4. **Verifikasi**: jalankan `npm run verify` serta acceptance checks spesifik
   fitur. Gate dasar mencakup validator, tooling lint/tests, build, lint, unit,
   dan HTTP e2e. Untuk DB/file/runtime, tambahkan bukti migration, concurrency,
   restart/persistensi, dan otorisasi sesuai tahap; starter tests tidak cukup.
5. **Catat**: buat progress baru, perbarui tracker dan quality bila berubah.
   Tutup dengan checklist, overwrite handoff, jalankan `npm run harness:index`
   lalu `npm run harness:check` setelah semua state diperbarui.

Status: `not_started`, `in_progress`, `blocked`, `passing`. `blocked` wajib
memiliki `blocked_reason`. `branch` adalah string untuk `in_progress`, boleh
null untuk status lain. Banyak fitur `blocked` lintas-branch diperbolehkan.
`passing` berarti seluruh acceptance criteria fitur terpenuhi, bukan hanya
kode berhasil dikompilasi. Bila regresi ditemukan, turunkan status dan catat
bukti; tangani tracker dependent yang ikut kehilangan prasyarat.

## Kontrak tracker dan evidence

Field wajib: `id`, `priority` (integer ≥ 0), `area`, `title`, `status`,
`branch`, `depends_on` (array ID), `spec` (path dokumen dengan anchor opsional),
`verification` (array cek non-kosong), dan `evidence` (array objek).

Evidence berbentuk `{"path":"harness/progress/<sesi>.md","summary":"hasil terukur"}`.
`passing` memerlukan evidence non-kosong, file progress tersedia, dan seluruh
dependensi `passing`. Progress mencatat perintah, hasil/exit code, cakupan,
serta apa yang belum diuji. Gunakan output tersanitasi; secret/data nyata tidak
boleh menjadi evidence. Validator memeriksa struktur/referensi, **bukan**
kebenaran narasi atau pemenuhan acceptance criteria; itu tanggung jawab review.

## Enforcement

- `npm run harness:check`: schema, ID, dependencies/cycle, satu fitur aktif per
  branch deklaratif, referensi spec/evidence, evidence-before-passing.
- `npm run harness:test`: regression tests tooling (Node built-in test runner).
- `npm run harness:check -- --base <commit>`: tambahan gate diff `<base>..HEAD`.
  Perubahan runtime/test/tooling/config atau tracker changed-to-passing
  memerlukan **progress baru**; progress lama tidak boleh diedit/dihapus.
  Base tidak valid membuat gate gagal, bukan diam-diam skip. Mode ini hanya
  memeriksa commit, bukan unstaged/staged/untracked; tanpa base hanya state lint.
- `.github/workflows/quality.yml`: menjalankan full gate; PR menjalankan diff
  gate terhadap base SHA. Workflow tidak melakukan push/auto-commit.
- `npm run harness:index`: render deterministik; input invalid gagal tanpa
  menimpa indeks lama. Regenerasi setelah merge untuk menggabungkan shard.

Repo awal belum memiliki commit; state lint/test bekerja tanpa HEAD. Diff gate
baru dapat digunakan setelah tersedia commit base dan HEAD. Required status
check/branch protection perlu diaktifkan pemilik repo di GitHub; file workflow
saja tidak menjamin enforcement server. Tidak ada git hook terpasang otomatis.
