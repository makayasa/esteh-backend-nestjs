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

type SaleWithItems = Prisma.SaleGetPayload<{
  include: { items: true; receipt: true };
}>;

// Q10: QRIS pending tidak masuk penjualan lunas — receipt null sampai
// konfirmasi manual; upload bukti saja tidak mengubah status.
const view = (sale: SaleWithItems) => ({
  id: sale.id,
  occurredAt: sale.occurredAt,
  recordedAt: sale.recordedAt,
  recordedBy: sale.recordedBy,
  method: sale.method,
  status: sale.receipt ? 'paid' : 'pending',
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
    );
  }
  // Q15: karyawan hanya transaksi sendiri pada hari WIB berjalan; admin semua.
  private scope(account: { id: string; role: string }, now: Date) {
    return account.role === 'admin'
      ? {}
      : { recordedBy: account.id, occurredAt: { gte: startOfWibDay(now) } };
  }
  private assertReadable(
    sale: { recordedBy: string; occurredAt: Date; method: string },
    account: { id: string; role: string },
  ) {
    if (
      account.role !== 'admin' &&
      (sale.recordedBy !== account.id ||
        sale.occurredAt.getTime() < startOfWibDay(this.clock.now()).getTime())
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
      include: { items: true, receipt: true },
    });
    if (!sale) throw new NotFoundException();
    this.assertReadable(sale, account);
    return sale;
  }
  // #11/Q27: unggah bukti ke penjualan QRIS pending yang sudah ada; file
  // ditulis sebelum referensi DB dibuat. Retry identik idempoten.
  uploadEvidence(
    auth: unknown,
    key: unknown,
    saleId: string,
    mime: string,
    bytes: unknown,
  ) {
    if (!(bytes instanceof Buffer)) throw new BadRequestException('Bukti invalid');
    if (bytes.length < 1 || bytes.length > MAX_EVIDENCE_BYTES)
      throw new BadRequestException('Ukuran bukti invalid');
    if (!EVIDENCE_MIME.includes(mime as never))
      throw new BadRequestException('Tipe bukti invalid');
    const cleaned = sanitizeEvidence(mime, bytes);
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
        const sale = await this.findScopedSale(tx, saleId, account);
        if (sale.method !== 'qris')
          throw new BadRequestException('Bukti hanya untuk QRIS');
        if (sale.receipt)
          throw new ConflictException('Penjualan sudah lunas');
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
    const value = object(input, ['reason', 'merchantRef']);
    const reason =
      value.reason === undefined
        ? undefined
        : text(value.reason, 1, 500);
    const merchantRef =
      value.merchantRef === undefined
        ? undefined
        : text(value.merchantRef, 1, 128);
    return this.identity.write(
      auth,
      'sale.confirm',
      key,
      { saleId, reason, merchantRef },
      async (tx, _actorId, account) => {
        // Lock baris penjualan: dua konfirmasi konkuren hanya satu efek.
        await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
        const sale = await tx.sale.findUnique({
          where: { id: saleId },
          include: { items: true, receipt: true },
        });
        if (!sale) throw new NotFoundException();
        this.assertReadable(sale, account);
        if (sale.method !== 'qris')
          throw new BadRequestException('Konfirmasi hanya untuk QRIS');
        if (sale.receipt)
          throw new ConflictException('Penjualan sudah lunas');
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
            receivedAt: now,
            receivedBy: account.id,
            // Q26: jejak pengecualian admin tanpa bukti tetap pada penerimaan.
            merchantRef: sale.evidencePath ? null : merchantRef,
            confirmReason: sale.evidencePath ? null : reason,
          },
        });
        const confirmed = await tx.sale.findUniqueOrThrow({
          where: { id: sale.id },
          include: { items: true, receipt: true },
        });
        return { result: view(confirmed), objectId: sale.id };
      },
      ['admin', 'employee'],
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
        include: { items: true, receipt: true },
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
        include: { items: true, receipt: true },
      });
      if (!sale) throw new NotFoundException();
      // Owner or admin; out-of-scope reads are 404, never a data leak.
      this.assertReadable(sale, account);
      return view(sale);
    });
  }
}
