# Esteh — panduan agent

## Mulai sesi

1. Periksa working tree; pertahankan perubahan milik pengguna.
2. Baca `harness/README.md`, lalu `harness/handoffs/<tiket>.md` dan
   `harness/features/<id>.json` yang relevan. Jika tiket belum ada, pilih slug
   stabil dan buat handoff dari `harness/templates/handoff.md`.
3. Untuk pekerjaan domain, baca `CONTEXT.md`,
   `docs/plans/mvp-decisions.md`, dan tahap terkait di
   `docs/plans/mvp-implementation-plan.md`. Keputusan terbaru mengalahkan
   riwayat rekomendasi lama; konflik scope memerlukan keputusan pengguna.

## Peran dan batas

- **Planner** menyimpan plan di `docs/plans/<slug>.md`: scope, dependensi,
  acceptance criteria, risiko, verifikasi, dan handoff implementer. Mode
  planning saja tidak mengubah kode aplikasi atau menyatakan fitur selesai.
- **Implementer** mengerjakan satu fitur aktif per branch, mengikuti plan dan
  mencatat bukti. Perubahan harness/tooling boleh ketika diminta eksplisit.
- **Reviewer** membandingkan diff dengan keputusan bisnis dan acceptance
  criteria, lalu memeriksa bukti; gate hijau bukan pengganti review perilaku.
- Commit, push, deployment, dan perubahan layanan eksternal menunggu permintaan
  pengguna. Tahap awal hanya localhost/LAN tepercaya dengan data uji (Q39).

## Arsitektur

Modular monolith NestJS; batas module dan invariant ada di rencana MVP bagian
4–5. Controller memanggil operasi bisnis; module pemilik menyembunyikan
transaksi, audit, dan idempotency. Uji invariant DB terhadap PostgreSQL nyata
saat fasilitasnya tersedia; mock/starter test bukan bukti konsistensi DB.
`package.json` dan config test adalah sumber kebenaran perintah tooling.

## Tutup sesi

Ikuti `harness/clean-state-checklist.md`: jalankan gate, tambah progress baru,
perbarui tracker, overwrite handoff, dan regenerasi indeks. Status `passing`
memerlukan seluruh acceptance criteria terpenuhi dan bukti yang dapat dibaca.
Laporkan gate gagal/belum dijalankan serta langkah berikutnya secara eksplisit.

## Navigasi graph

Jika `graphify-out/graph.json` tersedia, gunakan query graph untuk orientasi,
lalu verifikasi sumber aktual sebelum mengedit. Jika belum ada, baca file
langsung; provisioning Graphify tetap bagian P0. Jangan indeks secret,
foto privat, database, atau data transaksi.
