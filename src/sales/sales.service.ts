import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';
import { IdentityService } from '../identity/identity.service.js';
import { Clock } from '../clock.js';
import { object, text } from '../input.js';
import {
  EVIDENCE_MIME,
  MAX_EVIDENCE_BYTES,
  readEvidence,
  sanitizeEvidence,
  saveEvidence,
} from '../files/store.js';

// Q22: batas hari bisnis Asia/Jakarta, pergantian 00.00 WIB (UTC+7 tetap).
const startOfWibDay = (now: Date) => {
  const offset = 7 * 3600000;
  return new Date(
    Math.floor((now.getTime() + offset) / 86400000) * 86400000 - offset,
  );
};

// Waktu kejadian opsional untuk input susulan/pembatalan admin (Q12/Q21);
// mundur boleh, maju melebihi waktu server tidak.
const parseOccurredAt = (value: unknown, now: Date) => {
  if (value === undefined) return now;
  const timestamp = text(value, 20, 64);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      timestamp,
    )
  )
    throw new BadRequestException('Zona waktu wajib');
  const parsed = new Date(timestamp);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getTime() < 946684800000 ||
    parsed.getTime() > now.getTime() + 60000
  )
    throw new BadRequestException('Waktu kejadian invalid');
  return parsed;
};

const requiredText = (value: unknown, min: number, max: number) => {
  const trimmed = text(value, min, max).trim();
  if (trimmed.length < min) throw new BadRequestException('Nilai teks invalid');
  return trimmed;
};

type SaleWithItems = Prisma.SaleGetPayload<{
  include: { items: true; receipt: true; refund: true };
}>;

// Q10: QRIS pending tidak masuk penjualan lunas — receipt null sampai
// konfirmasi manual; upload bukti saja tidak mengubah status.
const view = (sale: SaleWithItems) => ({
  id: sale.id,
  occurredAt: sale.occurredAt,
  occurredBy: sale.occurredBy,
  recordedAt: sale.recordedAt,
  recordedBy: sale.recordedBy,
  method: sale.method,
  status: sale.cancelledAt ? 'cancelled' : sale.receipt ? 'paid' : 'pending',
  correctsId: sale.correctsId,
  correctedById: sale.correctedById,
  manualRef: sale.manualRef,
  reason: sale.reason,
  settlement: sale.settlement,
  items: sale.items.map((item) => ({
    productId: item.productId,
    name: item.name,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
  })),
  total: sale.items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  ),
  receipt: sale.receipt && {
    method: sale.receipt.method,
    amount: sale.receipt.amount,
    receivedAt: sale.receipt.receivedAt,
    confirmedAt: sale.receipt.confirmedAt,
  },
  refund: sale.refund && {
    amount: sale.refund.amount,
    method: sale.refund.method,
    reason: sale.refund.reason,
    occurredAt: sale.refund.occurredAt,
  },
  evidence: sale.evidencePath && {
    mime: sale.evidenceMime,
    size: sale.evidenceSize,
    uploadedAt: sale.evidenceAt,
  },
});

@Injectable()
export class SalesService {
  constructor(
    private readonly identity: IdentityService,
    private readonly clock: Clock,
  ) {}
  create(auth: unknown, key: unknown, input: unknown) {
    const value = object(input, ['items', 'method']);
    // Q9/Q10: satu metode pembayaran per penjualan; default tunai.
    const method =
      value.method === undefined ? 'cash' : text(value.method, 4, 5);
    if (method !== 'cash' && method !== 'qris')
      throw new BadRequestException('Metode invalid');
    if (!Array.isArray(value.items) || value.items.length < 1)
      throw new BadRequestException('Items invalid');
    const items = value.items.map((item: unknown) => {
      const entry = object(item, ['productId', 'quantity']);
      const productId = text(entry.productId, 1, 64);
      const quantity = entry.quantity;
      if (
        typeof quantity !== 'number' ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 10000
      )
        throw new BadRequestException('Quantity invalid');
      return { productId, quantity };
    });
    return this.identity.write(
      auth,
      'sale.create',
      key,
      { items, method },
      async (tx, actorId) => {
        const products = await tx.product.findMany({
          where: { id: { in: [...new Set(items.map((i) => i.productId))] } },
        });
        const byId = new Map(products.map((p) => [p.id, p]));
        const rows = items.map(({ productId, quantity }) => {
          const product = byId.get(productId);
          if (!product || !product.active || !product.available)
            throw new BadRequestException('Produk tidak tersedia');
          return {
            productId,
            name: product.name,
            unitPrice: product.price,
            quantity,
          };
        });
        const total = rows.reduce(
          (sum, row) => sum + row.unitPrice * row.quantity,
          0,
        );
        if (total < 1 || total > 1000000000)
          throw new BadRequestException('Total invalid');
        const now = this.clock.now();
        const sale = await tx.sale.create({
          // Q12: penjualan normal mencatat waktu kejadian = waktu input server;
          // karyawan tidak bisa memundurkan tanggal.
          data: {
            occurredAt: now,
            recordedAt: now,
            recordedBy: actorId,
            method,
          },
        });
        await tx.saleItem.createMany({
          data: rows.map((row) => ({ ...row, saleId: sale.id })),
        });
        // Q10: tunai mendapat penerimaan atomik; QRIS menunggu konfirmasi.
        if (method === 'cash')
          await tx.receipt.create({
            data: {
              saleId: sale.id,
              method: 'cash',
              amount: total,
              receivedAt: now,
              receivedBy: actorId,
            },
          });
        return {
          result: {
            id: sale.id,
            occurredAt: now,
            recordedAt: now,
            recordedBy: actorId,
            method,
            status: method === 'cash' ? 'paid' : 'pending',
            items: rows,
            total,
            receipt:
              method === 'cash'
                ? { method: 'cash', amount: total, receivedAt: now }
                : null,
            evidence: null,
          },
          objectId: sale.id,
        };
      },
      ['admin', 'employee'],
      async (tx, account, result) => {
        if (
          !result ||
          typeof result !== 'object' ||
          Array.isArray(result) ||
          typeof result.id !== 'string'
        )
          throw new NotFoundException();
        await this.findScopedSale(tx, result.id, account);
      },
    );
  }
  // Q23: admin memasukkan harga historis beralasan pada input susulan dan
  // koreksi; penjualan normal menolak field harga (snapshot katalog).
  private parseSaleItems(
    input: unknown,
    mode: 'forbidden' | 'optional' | 'required',
  ) {
    if (!Array.isArray(input) || input.length < 1 || input.length > 100)
      throw new BadRequestException('Items invalid');
    return input.map((raw: unknown) => {
      const entry = object(raw, [
        'productId',
        'quantity',
        ...(mode === 'forbidden' ? [] : ['unitPrice']),
      ]);
      const productId = text(entry.productId, 1, 64);
      const quantity = entry.quantity;
      if (
        typeof quantity !== 'number' ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 10000
      )
        throw new BadRequestException('Quantity invalid');
      if (mode === 'required' && entry.unitPrice === undefined)
        throw new BadRequestException('Harga historis wajib diisi');
      const unitPrice: number | undefined =
        mode !== 'forbidden' && entry.unitPrice !== undefined
          ? (entry.unitPrice as number)
          : undefined;
      if (
        unitPrice !== undefined &&
        (!Number.isInteger(unitPrice) ||
          unitPrice < 1 ||
          unitPrice > 1000000000)
      )
        throw new BadRequestException('Harga invalid');
      return { productId, quantity, unitPrice };
    });
  }

  // Item penjualan historis: produk harus ada; inactive masih sah untuk
  // catatan masa lalu; unitPrice override = harga historis beralasan (Q23).
  private async resolveSaleItems(
    tx: Prisma.TransactionClient,
    items: ReturnType<SalesService['parseSaleItems']>,
  ) {
    const products = await tx.product.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.productId))] } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return items.map(({ productId, quantity, unitPrice }) => {
      const product = byId.get(productId);
      if (!product) throw new BadRequestException('Produk tidak tersedia');
      return {
        productId,
        name: product.name,
        unitPrice: unitPrice ?? product.price,
        quantity,
      };
    });
  }

  private validMethod(value: unknown) {
    const method = value === undefined ? 'cash' : text(value, 4, 5);
    if (method !== 'cash' && method !== 'qris')
      throw new BadRequestException('Metode invalid');
    return method;
  }

  // Q12/Q23: input susulan admin — waktu kejadian asli, petugas, referensi
  // catatan manual, harga historis beralasan, dengan alasan dan audit.
  backfill(auth: unknown, key: unknown, input: unknown) {
    const value = object(input, [
      'items',
      'occurredAt',
      'occurredBy',
      'manualRef',
      'reason',
      'method',
    ]);
    const items = this.parseSaleItems(value.items, 'optional');
    const occurredAt = parseOccurredAt(
      value.occurredAt === undefined
        ? undefined
        : text(value.occurredAt, 20, 64),
      this.clock.now(),
    );
    if (value.occurredAt === undefined)
      throw new BadRequestException('Waktu kejadian wajib diisi');
    const occurredBy = text(value.occurredBy, 1, 64);
    const manualRef = requiredText(value.manualRef, 1, 128);
    const why = requiredText(value.reason, 1, 500);
    const method = this.validMethod(value.method);
    return this.identity.write(
      auth,
      'sale.backfill',
      key,
      { items, occurredAt, occurredBy, manualRef, reason: why, method },
      async (tx, actorId) => {
        if (
          occurredBy &&
          !(await tx.account.findUnique({ where: { id: occurredBy } }))
        )
          throw new BadRequestException('Petugas tidak ditemukan');
        const rows = await this.resolveSaleItems(tx, items);
        const total = rows.reduce(
          (sum, row) => sum + row.unitPrice * row.quantity,
          0,
        );
        if (total < 1 || total > 1000000000)
          throw new BadRequestException('Total invalid');
        const now = this.clock.now();
        const sale = await tx.sale.create({
          data: {
            occurredAt,
            recordedAt: now,
            recordedBy: actorId,
            method,
            occurredBy,
            manualRef,
            reason: why,
          },
        });
        await tx.saleItem.createMany({
          data: rows.map((row) => ({ ...row, saleId: sale.id })),
        });
        // Penerimaan susulan terjadi pada waktu uang diterima (Q21).
        if (method === 'cash')
          await tx.receipt.create({
            data: {
              saleId: sale.id,
              method: 'cash',
              amount: total,
              receivedAt: occurredAt,
              receivedBy: actorId,
            },
          });
        return {
          result: {
            id: sale.id,
            occurredAt,
            occurredBy,
            recordedAt: now,
            recordedBy: actorId,
            method,
            status: method === 'cash' ? 'paid' : 'pending',
            correctsId: null,
            correctedById: null,
            manualRef,
            reason: why,
            items: rows,
            total,
            receipt:
              method === 'cash'
                ? { method: 'cash', amount: total, receivedAt: occurredAt }
                : null,
            refund: null,
            evidence: null,
          },
          objectId: sale.id,
        };
      },
    );
  }

  // Q20/Q25/Q36: koreksi menghubungkan catatan lama dan pengganti tanpa
  // penerimaan/refund fiktif; riwayat nilai lama tetap terlihat.
  correct(auth: unknown, key: unknown, saleId: string, input: unknown) {
    const value = object(input, [
      'items',
      'reason',
      'method',
      'merchantRef',
      'evidenceUnavailableReason',
    ]);
    const evidenceUnavailableReason =
      value.evidenceUnavailableReason === undefined
        ? null
        : requiredText(value.evidenceUnavailableReason, 1, 500);
    const items = this.parseSaleItems(value.items, 'required');
    const why = requiredText(value.reason, 1, 500);
    const merchantRef =
      value.merchantRef === undefined
        ? undefined
        : requiredText(value.merchantRef, 1, 128);
    return this.identity.write(
      auth,
      'sale.correct',
      key,
      {
        saleId,
        items,
        reason: why,
        method: value.method ?? null,
        merchantRef: merchantRef ?? null,
        evidenceUnavailableReason,
      },
      async (tx, actorId) => {
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
        const old = await tx.sale.findUnique({
          where: { id: saleId },
          include: { items: true, receipt: true, refund: true },
        });
        if (!old) throw new NotFoundException();
        if (old.correctedById) throw new ConflictException('Sudah dikoreksi');
        if (old.correctsId)
          throw new ConflictException('Koreksi tidak dapat dikoreksi');
        if (old.refund)
          throw new ConflictException('Sudah direfund; koreksi biasa ditolak');
        if (old.cancelledAt)
          throw new ConflictException('Penjualan sudah dibatalkan');
        const method = this.validMethod(value.method ?? old.method);
        // Q25: koreksi metode menjadi QRIS memerlukan verifikasi merchant;
        // metode QRIS tetap terverifikasi pada catatan pengganti.
        if (
          method === 'qris' &&
          (!merchantRef || (!old.evidencePath && !evidenceUnavailableReason))
        )
          throw new BadRequestException(
            'QRIS wajib referensi merchant serta bukti atau alasan pengecualian',
          );
        const rows = await this.resolveSaleItems(tx, items);
        const total = rows.reduce(
          (sum, row) => sum + row.unitPrice * row.quantity,
          0,
        );
        if (total < 1 || total > 1000000000)
          throw new BadRequestException('Total invalid');
        const now = this.clock.now();
        const sale = await tx.sale.create({
          data: {
            occurredAt: old.occurredAt,
            recordedAt: now,
            recordedBy: actorId,
            method,
            correctsId: old.id,
            reason: why,
            occurredBy: old.occurredBy,
            manualRef: old.manualRef,
            evidencePath: old.evidencePath,
            evidenceMime: old.evidenceMime,
            evidenceSize: old.evidenceSize,
            evidenceAt: old.evidenceAt,
            evidenceBy: old.evidenceBy,
          },
        });
        await tx.saleItem.createMany({
          data: rows.map((row) => ({ ...row, saleId: sale.id })),
        });
        // Penerimaan lama dipertahankan sebagai riwayat; catatan pengganti
        // memuat penerimaan efektif senilai total koreksi (bukan uang kedua).
        if (old.receipt)
          await tx.receipt.create({
            data: {
              saleId: sale.id,
              method,
              amount: total,
              receivedAt: old.receipt.receivedAt,
              receivedBy: old.receipt.receivedBy,
              merchantRef: method === 'qris' ? merchantRef : null,
              confirmReason:
                method === 'qris' && !old.evidencePath
                  ? evidenceUnavailableReason
                  : null,
              confirmedAt: method === 'qris' ? now : null,
            },
          });
        await tx.sale.update({
          where: { id: old.id },
          data: { correctedById: sale.id },
        });
        const fresh = await tx.sale.findUniqueOrThrow({
          where: { id: sale.id },
          include: { items: true, receipt: true, refund: true },
        });
        return { result: view(fresh), objectId: sale.id };
      },
    );
  }

  // Q11: pembatalan admin beralasan; penerimaan tidak pernah dihapus sehingga
  // dana yang pernah diterima tetap terlihat; refund dicatat terpisah (Q21).
  cancel(auth: unknown, key: unknown, saleId: string, input: unknown) {
    const value = object(input, ['reason', 'settlement']);
    const why = requiredText(value.reason, 1, 500);
    const settlement =
      value.settlement === undefined
        ? null
        : requiredText(value.settlement, 1, 500);
    return this.identity.write(
      auth,
      'sale.cancel',
      key,
      { saleId, reason: why, settlement },
      async (tx, actorId) => {
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
        const sale = await tx.sale.findUnique({
          where: { id: saleId },
          include: { items: true, receipt: true, refund: true },
        });
        if (!sale) throw new NotFoundException();
        if (sale.cancelledAt) throw new ConflictException('Sudah dibatalkan');
        if (sale.correctedById) throw new ConflictException('Sudah dikoreksi');
        if (sale.receipt && !settlement)
          throw new BadRequestException('Penyelesaian uang wajib dijelaskan');
        const now = this.clock.now();
        await tx.sale.update({
          where: { id: sale.id },
          data: {
            cancelledAt: now,
            cancelledBy: actorId,
            cancelReason: why,
            settlement,
          },
        });
        const fresh = await tx.sale.findUniqueOrThrow({
          where: { id: sale.id },
          include: { items: true, receipt: true, refund: true },
        });
        return { result: view(fresh), objectId: sale.id };
      },
    );
  }

  // Q11/Q21: refund penuh dicatat setelah uang benar-benar dikembalikan;
  // nominal selalu sama dengan penerimaan aktual (trigger DB juga menolak).
  refund(auth: unknown, key: unknown, saleId: string, input: unknown) {
    const value = object(input, ['method', 'occurredAt', 'reason']);
    const method = requiredText(value.method, 1, 32);
    const why = requiredText(value.reason, 1, 500);
    const occurredAt = parseOccurredAt(
      value.occurredAt === undefined
        ? undefined
        : text(value.occurredAt, 20, 64),
      this.clock.now(),
    );
    return this.identity.write(
      auth,
      'sale.refund',
      key,
      { saleId, method, reason: why, occurredAt: value.occurredAt ?? null },
      async (tx, actorId) => {
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
        const sale = await tx.sale.findUnique({
          where: { id: saleId },
          include: { items: true, receipt: true, refund: true },
        });
        if (!sale) throw new NotFoundException();
        if (!sale.receipt)
          throw new BadRequestException('Penjualan belum lunas');
        if (sale.correctedById) throw new ConflictException('Sudah dikoreksi');
        if (sale.refund) throw new ConflictException('Sudah direfund');
        const now = this.clock.now();
        await tx.refund.create({
          data: {
            saleId: sale.id,
            amount: sale.receipt.amount,
            method,
            reason: why,
            occurredAt,
            recordedAt: now,
            recordedBy: actorId,
          },
        });
        const fresh = await tx.sale.findUniqueOrThrow({
          where: { id: sale.id },
          include: { items: true, receipt: true, refund: true },
        });
        return { result: view(fresh), objectId: sale.id };
      },
    );
  }

  // Q15: karyawan hanya transaksi sendiri pada hari WIB berjalan; admin semua.
  private scope(account: { id: string; role: string }, now: Date) {
    return account.role === 'admin'
      ? {}
      : {
          recordedBy: account.id,
          occurredAt: {
            gte: startOfWibDay(now),
            lt: new Date(startOfWibDay(now).getTime() + 86400000),
          },
        };
  }
  private assertReadable(
    sale: { recordedBy: string; occurredAt: Date; method: string },
    account: { id: string; role: string },
  ) {
    if (
      account.role !== 'admin' &&
      (sale.recordedBy !== account.id ||
        sale.occurredAt.getTime() < startOfWibDay(this.clock.now()).getTime() ||
        sale.occurredAt.getTime() >=
          startOfWibDay(this.clock.now()).getTime() + 86400000)
    )
      throw new NotFoundException();
  }
  private async findScopedSale(
    tx: Prisma.TransactionClient,
    id: string,
    account: { id: string; role: string },
  ) {
    const sale = await tx.sale.findUnique({
      where: { id },
      include: { items: true, receipt: true, refund: true },
    });
    if (!sale) throw new NotFoundException();
    this.assertReadable(sale, account);
    return sale;
  }
  // #11/Q27: unggah bukti ke penjualan QRIS pending yang sudah ada; file
  // ditulis sebelum referensi DB dibuat. Retry identik idempoten.
  async uploadEvidence(
    auth: unknown,
    key: unknown,
    saleId: string,
    mime: string,
    bytes: unknown,
  ) {
    if (!(bytes instanceof Buffer))
      throw new BadRequestException('Bukti invalid');
    if (bytes.length < 1 || bytes.length > MAX_EVIDENCE_BYTES)
      throw new BadRequestException('Ukuran bukti invalid');
    if (!EVIDENCE_MIME.includes(mime as never))
      throw new BadRequestException('Tipe bukti invalid');
    // Reject unauthenticated/out-of-scope requests before decoding untrusted bytes.
    await this.identity.authenticated(auth, async (tx, account) => {
      await this.findScopedSale(tx, saleId, account);
    });
    const cleaned = await sanitizeEvidence(mime, bytes);
    const payload = {
      saleId,
      mime,
      size: cleaned.length,
      sha256: createHash('sha256').update(cleaned).digest('hex'),
    };
    return this.identity.write(
      auth,
      'sale.evidence.upload',
      key,
      payload,
      async (tx, _actorId, account) => {
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
        const sale = await this.findScopedSale(tx, saleId, account);
        if (sale.method !== 'qris')
          throw new BadRequestException('Bukti hanya untuk QRIS');
        if (sale.cancelledAt)
          throw new ConflictException('Penjualan sudah dibatalkan');
        if (sale.receipt) throw new ConflictException('Penjualan sudah lunas');
        // Tulis file dulu; DB hanya mereferensi file yang sudah ada.
        const path = await saveEvidence(saleId, mime as never, cleaned);
        const now = this.clock.now();
        await tx.sale.update({
          where: { id: saleId },
          data: {
            evidencePath: path,
            evidenceMime: mime,
            evidenceSize: cleaned.length,
            evidenceAt: now,
            evidenceBy: account.id,
          },
        });
        return {
          result: {
            status: 'ok',
            evidence: { mime, size: cleaned.length, uploadedAt: now },
          },
          objectId: sale.id,
        };
      },
      ['admin', 'employee'],
      async (tx, account) => {
        await this.findScopedSale(tx, saleId, account);
      },
    );
  }
  // #11: unduh bukti via izin transaksi (bukan tautan statis); menebak ID
  // penjualan orang lain menghasilkan 404.
  async readEvidence(auth: unknown, saleId: string) {
    return this.identity.authenticated(auth, async (tx, account) => {
      const sale = await this.findScopedSale(tx, saleId, account);
      if (!sale.evidencePath) throw new NotFoundException();
      return {
        mime: sale.evidenceMime as string,
        bytes: await readEvidence(sale.evidencePath),
      };
    });
  }
  // #12/Q10/Q26: konfirmasi manual setelah pemeriksaan merchant. Karyawan
  // wajib bukti; admin tanpa bukti harus memberi alasan + referensi merchant.
  confirm(auth: unknown, key: unknown, saleId: string, input: unknown) {
    const value = object(input, ['reason', 'merchantRef', 'receivedAt']);
    const receivedAt =
      value.receivedAt === undefined
        ? null
        : parseOccurredAt(value.receivedAt, this.clock.now());
    const reason =
      value.reason === undefined
        ? undefined
        : requiredText(value.reason, 1, 500);
    const merchantRef =
      value.merchantRef === undefined
        ? undefined
        : requiredText(value.merchantRef, 1, 128);
    return this.identity.write(
      auth,
      'sale.confirm',
      key,
      { saleId, reason, merchantRef, receivedAt },
      async (tx, _actorId, account) => {
        // Lock baris penjualan: dua konfirmasi konkuren hanya satu efek.
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
        const sale = await tx.sale.findUnique({
          where: { id: saleId },
          include: { items: true, receipt: true, refund: true },
        });
        if (!sale) throw new NotFoundException();
        this.assertReadable(sale, account);
        if (sale.method !== 'qris')
          throw new BadRequestException('Konfirmasi hanya untuk QRIS');
        if (sale.cancelledAt)
          throw new ConflictException('Penjualan sudah dibatalkan');
        if (sale.receipt) throw new ConflictException('Penjualan sudah lunas');
        if (!sale.evidencePath && account.role !== 'admin')
          throw new BadRequestException('Bukti wajib diunggah');
        if (!sale.evidencePath && (!reason || !merchantRef))
          throw new BadRequestException(
            'Alasan dan referensi merchant wajib tanpa bukti',
          );
        const now = this.clock.now();
        const total = sale.items.reduce(
          (sum, item) => sum + item.unitPrice * item.quantity,
          0,
        );
        await tx.receipt.create({
          data: {
            saleId: sale.id,
            method: 'qris',
            amount: total,
            receivedAt: receivedAt ?? now,
            confirmedAt: now,
            receivedBy: account.id,
            // Q26: jejak pengecualian admin tanpa bukti tetap pada penerimaan.
            merchantRef: sale.evidencePath ? null : merchantRef,
            confirmReason: sale.evidencePath ? null : reason,
          },
        });
        const confirmed = await tx.sale.findUniqueOrThrow({
          where: { id: sale.id },
          include: { items: true, receipt: true, refund: true },
        });
        return { result: view(confirmed), objectId: sale.id };
      },
      ['admin', 'employee'],
      async (tx, account) => {
        await this.findScopedSale(tx, saleId, account);
      },
    );
  }
  list(auth: unknown, page = '1') {
    if (!/^[1-9]\d{0,5}$/.test(page))
      throw new BadRequestException('Page invalid');
    return this.identity.authenticated(auth, async (tx, account) => {
      const sales = await tx.sale.findMany({
        where: this.scope(account, this.clock.now()),
        orderBy: { id: 'asc' },
        take: 50,
        skip: (Number(page) - 1) * 50,
        include: { items: true, receipt: true, refund: true },
      });
      return {
        items: sales.map(view),
        page: Number(page),
        pageSize: 50,
      };
    });
  }
  detail(auth: unknown, id: string) {
    return this.identity.authenticated(auth, async (tx, account) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: { items: true, receipt: true, refund: true },
      });
      if (!sale) throw new NotFoundException();
      // Owner or admin; out-of-scope reads are 404, never a data leak.
      this.assertReadable(sale, account);
      return view(sale);
    });
  }
}
