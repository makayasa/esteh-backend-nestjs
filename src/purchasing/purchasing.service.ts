import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { IdentityService } from '../identity/identity.service.js';
import { Clock } from '../clock.js';
import { object, text } from '../input.js';

// Q8: satu satuan tetap per bahan; kuantitas disimpan sebagai mikro satuan
// (10^-3) sehingga saldo, ledger, dan guard non-negatif tetap integer.
const MAX_MICROS = 1_000_000_000;
const MAX_COST = 1_000_000_000;
const factor = (quantityScale: number) => 10 ** quantityScale;

const toMicros = (
  quantity: unknown,
  quantityScale: number,
  signed = false,
): number => {
  if (
    typeof quantity !== 'number' ||
    !Number.isFinite(quantity) ||
    quantity === 0 ||
    Math.abs(quantity) > MAX_MICROS
  )
    throw new BadRequestException('Kuantitas invalid');
  const exact = quantity * factor(quantityScale);
  const micros = Math.round(exact);
  if (
    Math.abs(exact - micros) > 1e-6 ||
    Math.abs(micros) < 1 ||
    Math.abs(micros) > MAX_MICROS ||
    (!signed && micros < 0)
  )
    throw new BadRequestException('Kuantitas invalid');
  return micros;
};

const fromMicros = (micros: number, quantityScale: number) =>
  micros / factor(quantityScale);

// Waktu kejadian opsional untuk admin (pemakaian harian/pengeluaran mundur);
// default waktu server. Karyawan tidak memakai modul ini sama sekali (Q15).
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

const reason = (value: unknown) => {
  const trimmed = text(value, 1, 280).trim();
  if (!trimmed) throw new BadRequestException('Alasan wajib diisi');
  return trimmed;
};

const cost = (value: unknown) => {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_COST
  )
    throw new BadRequestException('Biaya invalid');
  return value;
};

type LedgerRow = Prisma.StockLedgerGetPayload<{ include: { material: true } }>;
type PurchaseRow = Prisma.PurchaseGetPayload<{ include: { items: true } }>;

const ledgerView = (row: LedgerRow) => ({
  id: row.id,
  materialId: row.materialId,
  material: {
    name: row.material.name,
    unit: row.material.unit,
    quantityScale: row.material.quantityScale,
  },
  kind: row.kind,
  deltaMicros: row.deltaMicros,
  delta: fromMicros(row.deltaMicros, row.material.quantityScale),
  reason: row.reason,
  purchaseId: row.purchaseId,
  correctsId: row.correctsId,
  occurredAt: row.occurredAt,
  recordedAt: row.recordedAt,
  recordedBy: row.recordedBy,
});

const purchaseView = (row: PurchaseRow) => ({
  id: row.id,
  occurredAt: row.occurredAt,
  recordedAt: row.recordedAt,
  recordedBy: row.recordedBy,
  correctsId: row.correctsId,
  correctedById: row.correctedById,
  reason: row.reason,
  items: row.items.map((item) => ({
    materialId: item.materialId,
    name: item.name,
    quantityMicros: item.quantityMicros,
    unit: item.unit,
    cost: item.cost,
  })),
  total: row.items.reduce((sum, item) => sum + item.cost, 0),
});

const expenseView = (row: {
  id: string;
  category: string;
  amount: number;
  note: string | null;
  occurredAt: Date;
  recordedAt: Date;
  recordedBy: string;
  correctsId: string | null;
  correctedById: string | null;
  reason: string | null;
}) => ({
  id: row.id,
  category: row.category,
  amount: row.amount,
  note: row.note,
  occurredAt: row.occurredAt,
  recordedAt: row.recordedAt,
  recordedBy: row.recordedBy,
  correctsId: row.correctsId,
  correctedById: row.correctedById,
  reason: row.reason,
});

// materialId null = pembelian alat: kuantitas dihitung utuh, tanpa stok (Q8).
type Item = {
  materialId: string | null;
  name: string;
  quantity: number;
  cost: number;
};

@Injectable()
export class PurchasingService {
  constructor(
    private readonly identity: IdentityService,
    private readonly clock: Clock,
  ) {}

  private parseItems(input: unknown): Item[] {
    if (!Array.isArray(input) || input.length < 1 || input.length > 100)
      throw new BadRequestException('Items invalid');
    return input.map((raw) => {
      const entry = object(raw, ['materialId', 'name', 'quantity', 'cost']);
      const name = text(entry.name, 1, 120).trim();
      if (!name) throw new BadRequestException('Nama invalid');
      return {
        materialId:
          entry.materialId === undefined || entry.materialId === null
            ? null
            : text(entry.materialId, 1, 64),
        name,
        quantity: entry.quantity as number,
        cost: cost(entry.cost),
      };
    });
  }

  // Kuantitas item diubah ke mikro satuan menurut satuan tetap bahan;
  // bahan harus aktif. Alat memakai jumlah utuh tanpa sentuhan stok.
  private async materializedItems(tx: Prisma.TransactionClient, items: Item[]) {
    const materials = await tx.material.findMany({
      where: {
        id: {
          in: [
            ...new Set(
              items.flatMap((i) => (i.materialId ? [i.materialId] : [])),
            ),
          ],
        },
      },
    });
    const byId = new Map(materials.map((m) => [m.id, m]));
    return items.map((item) => {
      if (item.materialId === null) {
        if (
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          item.quantity > MAX_MICROS
        )
          throw new BadRequestException('Kuantitas invalid');
        return { ...item, quantityMicros: item.quantity, unit: null };
      }
      const material = byId.get(item.materialId);
      if (!material || !material.active)
        throw new BadRequestException('Bahan tidak tersedia');
      return {
        ...item,
        quantityMicros: toMicros(item.quantity, material.quantityScale),
        unit: material.unit,
      };
    });
  }

  // Stok dan ledger bergerak bersama; guard atomik menolak saldo akhir
  // negatif tanpa perubahan parsial (seluruh transaksi ikut dibatalkan).
  private async applyDelta(
    tx: Prisma.TransactionClient,
    materialId: string,
    deltaMicros: number,
  ) {
    const lowered =
      deltaMicros < 0
        ? await tx.$executeRaw`
            UPDATE "Material" SET stock = stock + ${deltaMicros}
            WHERE id = ${materialId} AND stock >= ${-deltaMicros}`
        : await tx.$executeRaw`
            UPDATE "Material" SET stock = stock + ${deltaMicros}
            WHERE id = ${materialId}`;
    if (lowered !== 1)
      throw new BadRequestException('Saldo stok tidak mencukupi');
  }

  purchase(auth: unknown, key: unknown, input: unknown) {
    const value = object(input, ['items', 'occurredAt']);
    const items = this.parseItems(value.items);
    return this.identity.write(
      auth,
      'purchase.create',
      key,
      { items, occurredAt: value.occurredAt ?? null },
      async (tx, actorId) => {
        const rows = await this.materializedItems(tx, items);
        const occurredAt = parseOccurredAt(value.occurredAt, this.clock.now());
        const now = this.clock.now();
        const purchase = await tx.purchase.create({
          data: { occurredAt, recordedAt: now, recordedBy: actorId },
        });
        await tx.purchaseItem.createMany({
          data: rows.map((row) => ({
            purchaseId: purchase.id,
            materialId: row.materialId,
            name: row.name,
            quantityMicros: row.quantityMicros,
            unit: row.unit,
            cost: row.cost,
          })),
        });
        for (const row of rows) {
          if (row.materialId === null) continue;
          await this.applyDelta(tx, row.materialId, row.quantityMicros);
          await tx.stockLedger.create({
            data: {
              materialId: row.materialId,
              kind: 'purchase',
              deltaMicros: row.quantityMicros,
              purchaseId: purchase.id,
              occurredAt,
              recordedAt: now,
              recordedBy: actorId,
            },
          });
        }
        return {
          result: purchaseView({
            ...purchase,
            items: rows.map((row) => ({
              ...row,
              id: '',
              purchaseId: purchase.id,
            })),
          }),
          objectId: purchase.id,
        };
      },
    );
  }

  // Q36: koreksi pembelian menghubungkan catatan lama/pengganti dan
  // memperbarui stok + nilai pembelian secara atomik tanpa hard-delete.
  correctPurchase(auth: unknown, key: unknown, id: string, input: unknown) {
    const value = object(input, ['items', 'reason']);
    const items = this.parseItems(value.items);
    const why = reason(value.reason);
    return this.identity.write(
      auth,
      'purchase.correct',
      key,
      { id, items, reason: why },
      async (tx, actorId) => {
        await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${id} FOR UPDATE`;
        const old = await tx.purchase.findUnique({
          where: { id },
          include: { items: true },
        });
        if (!old) throw new NotFoundException();
        if (old.correctedById) throw new ConflictException('Sudah dikoreksi');
        const rows = await this.materializedItems(tx, items);
        const delta = new Map<string, number>();
        for (const item of old.items)
          if (item.materialId)
            delta.set(
              item.materialId,
              (delta.get(item.materialId) ?? 0) - item.quantityMicros,
            );
        for (const row of rows)
          if (row.materialId)
            delta.set(
              row.materialId,
              (delta.get(row.materialId) ?? 0) + row.quantityMicros,
            );
        for (const [materialId, diff] of delta)
          if (diff !== 0) await this.applyDelta(tx, materialId, diff);
        const now = this.clock.now();
        const purchase = await tx.purchase.create({
          data: {
            occurredAt: old.occurredAt,
            recordedAt: now,
            recordedBy: actorId,
            correctsId: old.id,
            reason: why,
          },
        });
        await tx.purchaseItem.createMany({
          data: rows.map((row) => ({
            purchaseId: purchase.id,
            materialId: row.materialId,
            name: row.name,
            quantityMicros: row.quantityMicros,
            unit: row.unit,
            cost: row.cost,
          })),
        });
        for (const [materialId, diff] of delta)
          if (diff !== 0)
            await tx.stockLedger.create({
              data: {
                materialId,
                kind: 'correction',
                deltaMicros: diff,
                reason: why,
                purchaseId: purchase.id,
                occurredAt: now,
                recordedAt: now,
                recordedBy: actorId,
              },
            });
        await tx.purchase.update({
          where: { id: old.id },
          data: { correctedById: purchase.id },
        });
        return {
          result: {
            ...purchaseView({
              ...purchase,
              items: rows.map((row) => ({
                ...row,
                id: '',
                purchaseId: purchase.id,
              })),
            }),
            correctedPurchaseId: old.id,
            reason: why,
          },
          objectId: purchase.id,
        };
      },
    );
  }

  purchases(auth: unknown, page = '1') {
    if (!/^[1-9]\d{0,5}$/.test(page))
      throw new BadRequestException('Page invalid');
    return this.identity.authenticated(auth, async (tx, account) => {
      if (account.role !== 'admin') throw new ForbiddenException();
      const rows = await tx.purchase.findMany({
        orderBy: { id: 'asc' },
        take: 50,
        skip: (Number(page) - 1) * 50,
        include: { items: true },
      });
      return {
        items: rows.map(purchaseView),
        page: Number(page),
        pageSize: 50,
      };
    });
  }

  expense(auth: unknown, key: unknown, input: unknown) {
    const value = object(input, ['category', 'amount', 'note', 'occurredAt']);
    const category = text(value.category, 1, 64).trim();
    if (!category) throw new BadRequestException('Kategori invalid');
    const amount = cost(value.amount);
    const note =
      value.note === undefined ? null : text(value.note, 1, 280).trim();
    return this.identity.write(
      auth,
      'expense.create',
      key,
      { category, amount, note, occurredAt: value.occurredAt ?? null },
      async (tx, actorId) => {
        const occurredAt = parseOccurredAt(value.occurredAt, this.clock.now());
        const now = this.clock.now();
        const row = await tx.expense.create({
          data: {
            category,
            amount,
            note,
            occurredAt,
            recordedAt: now,
            recordedBy: actorId,
          },
        });
        return { result: expenseView(row), objectId: row.id };
      },
    );
  }

  correctExpense(auth: unknown, key: unknown, id: string, input: unknown) {
    const value = object(input, ['category', 'amount', 'note', 'reason']);
    const category = text(value.category, 1, 64).trim();
    if (!category) throw new BadRequestException('Kategori invalid');
    const amount = cost(value.amount);
    const why = reason(value.reason);
    const note =
      value.note === undefined ? null : text(value.note, 1, 280).trim();
    return this.identity.write(
      auth,
      'expense.correct',
      key,
      { id, category, amount, note, reason: why },
      async (tx, actorId) => {
        await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${id} FOR UPDATE`;
        const old = await tx.expense.findUnique({ where: { id } });
        if (!old) throw new NotFoundException();
        if (old.correctedById) throw new ConflictException('Sudah dikoreksi');
        const now = this.clock.now();
        const row = await tx.expense.create({
          data: {
            category,
            amount,
            note,
            occurredAt: old.occurredAt,
            recordedAt: now,
            recordedBy: actorId,
            correctsId: old.id,
            reason: why,
          },
        });
        await tx.expense.update({
          where: { id: old.id },
          data: { correctedById: row.id },
        });
        return {
          result: {
            ...expenseView(row),
            correctedExpenseId: old.id,
            reason: why,
          },
          objectId: row.id,
        };
      },
    );
  }

  expenses(auth: unknown, page = '1') {
    if (!/^[1-9]\d{0,5}$/.test(page))
      throw new BadRequestException('Page invalid');
    return this.identity.authenticated(auth, async (tx, account) => {
      if (account.role !== 'admin') throw new ForbiddenException();
      return {
        items: (
          await tx.expense.findMany({
            orderBy: { id: 'asc' },
            take: 50,
            skip: (Number(page) - 1) * 50,
          })
        ).map(expenseView),
        page: Number(page),
        pageSize: 50,
      };
    });
  }

  // Q18: pemakaian agregat harian, rusak/terbuang, penyesuaian fisik —
  // satu jalur mutasi beralasan dengan saldo non-negatif yang atomik.
  private async mutate(
    operation: string,
    auth: unknown,
    key: unknown,
    input: unknown,
    kind: 'usage' | 'waste' | 'adjustment',
  ) {
    const value = object(input, [
      'materialId',
      kind === 'adjustment' ? 'delta' : 'quantity',
      'reason',
      'occurredAt',
    ]);
    const materialId = text(value.materialId, 1, 64);
    const why = reason(value.reason);
    const field = kind === 'adjustment' ? 'delta' : 'quantity';
    const amount = value[field];
    if (typeof amount !== 'number' || !Number.isFinite(amount))
      throw new BadRequestException('Kuantitas invalid');
    return this.identity.write(
      auth,
      operation,
      key,
      {
        materialId,
        [field]: amount,
        reason: why,
        occurredAt: value.occurredAt ?? null,
      },
      async (tx, actorId) => {
        const occurredAt = parseOccurredAt(value.occurredAt, this.clock.now());
        const material = await tx.material.findUnique({
          where: { id: materialId },
        });
        if (!material) throw new NotFoundException('Bahan tidak ditemukan');
        const delta =
          kind === 'adjustment'
            ? toMicros(amount, material.quantityScale, true)
            : -toMicros(amount, material.quantityScale);
        await this.applyDelta(tx, materialId, delta);
        const now = this.clock.now();
        await tx.stockLedger.create({
          data: {
            materialId,
            kind,
            deltaMicros: delta,
            reason: why,
            occurredAt,
            recordedAt: now,
            recordedBy: actorId,
          },
        });
        const fresh = await tx.material.findUniqueOrThrow({
          where: { id: materialId },
        });
        return {
          result: {
            materialId,
            kind,
            deltaMicros: delta,
            delta: fromMicros(delta, material.quantityScale),
            stock: fromMicros(fresh.stock, material.quantityScale),
            stockMicros: fresh.stock,
            reason: why,
            occurredAt,
          },
          objectId: materialId,
        };
      },
    );
  }

  usage(auth: unknown, key: unknown, input: unknown) {
    return this.mutate('stock.usage', auth, key, input, 'usage');
  }

  waste(auth: unknown, key: unknown, input: unknown) {
    return this.mutate('stock.waste', auth, key, input, 'waste');
  }

  adjust(auth: unknown, key: unknown, input: unknown) {
    return this.mutate('stock.adjustment', auth, key, input, 'adjustment');
  }

  // Koreksi mutasi membuat entri koreksi berdelta selisih yang menunjuk
  // catatan asal; entri koreksi tidak dapat dikoreksi lagi.
  correctMutation(auth: unknown, key: unknown, id: string, input: unknown) {
    const value = object(input, ['delta', 'reason']);
    const why = reason(value.reason);
    if (typeof value.delta !== 'number' || !Number.isFinite(value.delta))
      throw new BadRequestException('Kuantitas invalid');
    return this.identity.write(
      auth,
      'stock.correct',
      key,
      { id, delta: value.delta, reason: why },
      async (tx, actorId) => {
        await tx.$queryRaw`SELECT id FROM "StockLedger" WHERE id = ${id} FOR UPDATE`;
        const old = await tx.stockLedger.findUnique({
          where: { id },
          include: { material: true },
        });
        if (!old) throw new NotFoundException();
        if (old.kind === 'correction')
          throw new ConflictException('Koreksi tidak dapat dikoreksi');
        const delta = toMicros(value.delta, old.material.quantityScale, true);
        const now = this.clock.now();
        await this.applyDelta(tx, old.materialId, delta);
        await tx.stockLedger.create({
          data: {
            materialId: old.materialId,
            kind: 'correction',
            deltaMicros: delta,
            reason: why,
            correctsId: old.id,
            occurredAt: now,
            recordedAt: now,
            recordedBy: actorId,
          },
        });
        const fresh = await tx.material.findUniqueOrThrow({
          where: { id: old.materialId },
        });
        return {
          result: {
            correctsId: old.id,
            deltaMicros: delta,
            delta: fromMicros(delta, old.material.quantityScale),
            stock: fromMicros(fresh.stock, old.material.quantityScale),
            stockMicros: fresh.stock,
            reason: why,
          },
          objectId: old.id,
        };
      },
    );
  }

  ledger(auth: unknown, materialId = '', page = '1') {
    if (!/^[1-9]\d{0,5}$/.test(page))
      throw new BadRequestException('Page invalid');
    return this.identity.authenticated(auth, async (tx, account) => {
      if (account.role !== 'admin') throw new ForbiddenException();
      const rows = await tx.stockLedger.findMany({
        where: materialId ? { materialId } : {},
        orderBy: { id: 'asc' },
        take: 50,
        skip: (Number(page) - 1) * 50,
        include: { material: true },
      });
      const material = materialId
        ? await tx.material.findUnique({ where: { id: materialId } })
        : null;
      return {
        items: rows.map(ledgerView),
        ...(material && {
          material: {
            id: material.id,
            name: material.name,
            unit: material.unit,
            quantityScale: material.quantityScale,
            stock: fromMicros(material.stock, material.quantityScale),
            stockMicros: material.stock,
          },
        }),
        page: Number(page),
        pageSize: 50,
      };
    });
  }

  balances(auth: unknown) {
    return this.identity.authenticated(auth, async (tx, account) => {
      if (account.role !== 'admin') throw new ForbiddenException();
      return {
        items: (
          await tx.material.findMany({
            orderBy: { id: 'asc' },
            select: {
              id: true,
              name: true,
              unit: true,
              quantityScale: true,
              active: true,
              stock: true,
            },
          })
        ).map((row) => ({
          ...row,
          stock: fromMicros(row.stock, row.quantityScale),
        })),
      };
    });
  }
}
