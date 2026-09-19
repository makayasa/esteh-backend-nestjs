import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { IdentityService } from '../identity/identity.service.js';
import { Clock } from '../clock.js';
import { object, text } from '../input.js';

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

const view = (sale: SaleWithItems) => ({
  id: sale.id,
  occurredAt: sale.occurredAt,
  recordedBy: sale.recordedBy,
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
});

@Injectable()
export class SalesService {
  constructor(
    private readonly identity: IdentityService,
    private readonly clock: Clock,
  ) {}
  create(auth: unknown, key: unknown, input: unknown) {
    const value = object(input, ['items']);
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
      { items },
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
          data: { occurredAt: now, recordedBy: actorId },
        });
        await tx.saleItem.createMany({
          data: rows.map((row) => ({ ...row, saleId: sale.id })),
        });
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
            recordedBy: actorId,
            items: rows,
            total,
            receipt: { method: 'cash', amount: total, receivedAt: now },
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
      if (
        account.role !== 'admin' &&
        (sale.recordedBy !== account.id ||
          sale.occurredAt.getTime() < startOfWibDay(this.clock.now()).getTime())
      )
        throw new NotFoundException();
      return view(sale);
    });
  }
}
