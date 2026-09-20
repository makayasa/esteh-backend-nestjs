# Quality baseline — 2026-09-20

| Area | Status | Bukti / batas |
| --- | --- | --- |
| Harness | Gate lokal lulus |17tracker valid,13/13tooling; index/state/diff gate exit0 |
| Build/lint/unit/e2e | Lulus | verify exit0; unit1/1,e2e2/2, bukan bukti domain sendiri |
| P0–P8 | Acceptance lokal terverifikasi | PostgreSQL17 nyata, CLI/HTTP, clock, role/replay, concurrent rollback, foto, stok, koreksi, laporan |
| P9 beban | Lulus profil sintetis |1000sales/10users/error0,p50=21/p95=28/p99=32ms; receipt/refund/ledger rekonsiliasi |
| Runtime | Lulus lokal | Compose10migration/replay, DB-down503/recovery, DB/foto restart/down-up persisten; localhost saja |
| Graph | Terbatas |38allowlist files267nodes480edges;69raw unresolved AST edges diungkap, source audit lulus |
| Dependency audit | Risiko terbuka |9advisory baseline Prisma/mau; tidak downgrade major otomatis |
| Produksi | Belum siap | TLS, backup/restore RPO/RTO, notifikasi, uji mobile nyata belum disertifikasi |

Bukti: [handoff agregat](handoffs/aggregate-certification.md),
[review fondasi](progress/2026-09-19-aggregate-review.md),
[review P5–P7](progress/2026-09-20-p5-p7-review-fixes.md),
[P8](progress/2026-09-20-p8-reporting.md),
[P9](progress/2026-09-20-p9-load-handoff.md).

Warning non-fatal: Vitest vite-tsconfig-paths, pg concurrent query deprecation.
Native Node Argon2 experimental. Diff gate tidak mencakup working tree belum commit.
