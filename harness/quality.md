# Quality baseline — 2026-09-19

Hanya mencatat hasil yang diamati; tidak mewarisi rating project MyXL.

| Area | Status | Bukti / gap |
| --- | --- | --- |
| Harness/tooling | Terverifikasi lokal | Validator 11 tracker, tooling tests 13/13, oxlint dan formatting lulus |
| Build backend | Lulus lokal | `prisma generate && nest build`, exit 0, Node 26.4.0 |
| Lint backend | Lulus lokal | Oxlint type-aware, exit 0 |
| Unit backend | Lulus terbatas | 1/1 starter test, bukan bukti fitur bisnis |
| HTTP e2e | Lulus terbatas | 2/2; kontrak body health diperbaiki, DB-down TCP terisolasi dari environment host |
| P0 runtime | Terverifikasi lokal | Compose context/volume baru, migration + replay, DB-down 503/unhealthy/recovery, restart/down-up persisten, bind localhost, DB privat |
| P0 Graphify | Terverifikasi terbatas | Generate berulang, query/path health dan audit allowlist/output lulus; AST + heading dokumen, 46 raw unresolved edges pada graph final diungkap; P0 passing |
| P1/P2 | Parsial terverifikasi | #3/#4/#5 passing; HTTP/CLI PostgreSQL nyata, concurrency/rollback, expiry/revocation; aggregate belum selesai |
| P3 | Parsial terverifikasi | #7 passing; master #6 lulus tetapi harga historis/payload sales menunggu #8 |
| P4–P9 | Belum mulai | Tidak ada klaim domain penjualan/stok/laporan selesai |
| Dependency audit | Perlu review | 9 advisories: 2 low/1 moderate/6 high pada Prisma/mau tree; tidak downgrade major otomatis |
| CI / branch protection | Belum diverifikasi remote | Workflow tersedia; belum push/run, required check belum disetel |

Sumber: [progress bootstrap](progress/2026-09-19-harness-bootstrap.md) dan
[rekonsiliasi runtime P0](progress/2026-09-19-p0-local-runtime-reconciliation.md),
[Graphify issue #2](progress/2026-09-19-issue-02-graphify.md),
[penutupan #3–#7](progress/2026-09-19-issues-03-07-closeout.md).
Build/test dasar bukan bukti siap integrasi atau produksi. Warning Vitest:
`vite-tsconfig-paths` dapat diganti resolver native Vite; bukan kegagalan gate.
