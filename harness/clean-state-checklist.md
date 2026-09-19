# Clean-state checklist

- [ ] Scope/acceptance criteria yang selesai dan belum selesai dicatat.
- [ ] `npm run verify` dijalankan; hasil dan kegagalan dicatat, bukan disembunyikan.
- [ ] Acceptance checks runtime/DB/file yang relevan punya bukti, atau ditulis
      sebagai belum terverifikasi; build bukan smoke deployment.
- [ ] Progress baru berisi perintah, hasil, perubahan, risiko, dan next step.
- [ ] Tracker jujur; `passing` memiliki evidence dan memenuhi semua criteria.
- [ ] Handoff menyebut branch, feature, Verified Now / Changed / Broken Or
      Unverified / Next Best Step / Commands.
- [ ] `npm run harness:index` dan `npm run harness:check` dijalankan setelah update.
- [ ] Diff/status diperiksa; perubahan pengguna tetap utuh, secret tidak dicatat.

Working tree bersih bukan berarti wajib commit. Bila belum diminta commit,
catat perubahan yang belum di-commit agar sesi berikut dapat melanjutkan.
