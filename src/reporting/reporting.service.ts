import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { IdentityService } from '../identity/identity.service.js';
import { object, text } from '../input.js';

function range(query: unknown) {
  const value = object(query, ['from', 'to', 'page']);
  const date = (input: unknown) => {
    const day = text(input, 10, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
      throw new BadRequestException('Tanggal invalid');
    const utc = new Date(`${day}T00:00:00Z`);
    if (
      !Number.isFinite(utc.getTime()) ||
      utc.toISOString().slice(0, 10) !== day
    )
      throw new BadRequestException('Tanggal invalid');
    return new Date(utc.getTime() - 7 * 3600000);
  };
  const from = date(value.from),
    last = date(value.to);
  if (last < from || last.getTime() - from.getTime() > 365 * 86400000)
    throw new BadRequestException('Rentang maksimal 366 hari');
  const page = value.page === undefined ? '1' : text(value.page, 1, 6);
  if (!/^[1-9]\d*$/.test(page)) throw new BadRequestException('Page invalid');
  return { from, to: new Date(last.getTime() + 86400000), page: Number(page) };
}

@Injectable()
export class ReportingService {
  constructor(private readonly identity: IdentityService) {}
  costs(auth: unknown, query: unknown) {
    const { from, to, page } = range(query);
    return this.identity.authenticated(auth, async (tx, account) => {
      if (account.role !== 'admin') throw new ForbiddenException();
      const [row] = await tx.$queryRaw<{ result: object }[]>`
        WITH purchases AS (
          SELECT p.id, p."occurredAt", p.reason, SUM(i.cost)::bigint AS total
          FROM "Purchase" p JOIN "PurchaseItem" i ON i."purchaseId"=p.id
          WHERE p."correctedById" IS NULL AND p."occurredAt">=${from} AND p."occurredAt"<${to}
          GROUP BY p.id
        ), expenses AS (
          SELECT id, category, amount, "occurredAt", reason FROM "Expense"
          WHERE "correctedById" IS NULL AND "occurredAt">=${from} AND "occurredAt"<${to}
        ) SELECT jsonb_build_object(
          'purchasesTotal', (SELECT COALESCE(SUM(total),0) FROM purchases),
          'expensesTotal', (SELECT COALESCE(SUM(amount),0) FROM expenses),
          'purchasesCount', (SELECT COUNT(*) FROM purchases),
          'expensesCount', (SELECT COUNT(*) FROM expenses),
          'purchases', COALESCE((SELECT jsonb_agg(p ORDER BY p.id) FROM (SELECT * FROM purchases ORDER BY id LIMIT 50 OFFSET ${(page - 1) * 50}) p), '[]'::jsonb),
          'expenses', COALESCE((SELECT jsonb_agg(p ORDER BY p.id) FROM (SELECT * FROM expenses ORDER BY id LIMIT 50 OFFSET ${(page - 1) * 50}) p), '[]'::jsonb)
        ) AS result`;
      return { ...row.result, page, pageSize: 50, timezone: 'Asia/Jakarta' };
    });
  }
  payments(auth: unknown, query: unknown) {
    const { from, to, page } = range(query);
    return this.identity.authenticated(auth, async (tx, account) => {
      if (account.role !== 'admin') throw new ForbiddenException();
      const [row] = await tx.$queryRaw<{ result: object }[]>`
        WITH receipts AS (
          SELECT r.* FROM "Receipt" r JOIN "Sale" s ON s.id=r."saleId"
          WHERE s."correctedById" IS NULL AND r."receivedAt">=${from} AND r."receivedAt"<${to}
        ), refunds AS (
          SELECT * FROM "Refund" WHERE "occurredAt">=${from} AND "occurredAt"<${to}
        ), pending AS (
          SELECT s.id, s."occurredAt" FROM "Sale" s LEFT JOIN "Receipt" r ON r."saleId"=s.id
          WHERE r.id IS NULL AND s.method='qris' AND s."cancelledAt" IS NULL AND s."correctedById" IS NULL
            AND s."occurredAt">=${from} AND s."occurredAt"<${to}
        ) SELECT jsonb_build_object(
          'cash', (SELECT COALESCE(SUM(amount),0) FROM receipts WHERE method='cash'),
          'qris', (SELECT COALESCE(SUM(amount),0) FROM receipts WHERE method='qris'),
          'refund', (SELECT COALESCE(SUM(amount),0) FROM refunds),
          'pendingCount', (SELECT COUNT(*) FROM pending),
          'pending', COALESCE((SELECT jsonb_agg(p ORDER BY p.id) FROM (SELECT * FROM pending ORDER BY id LIMIT 50 OFFSET ${(page - 1) * 50}) p), '[]'::jsonb),
          'receipts', COALESCE((SELECT jsonb_agg(p ORDER BY p.id) FROM (SELECT * FROM receipts ORDER BY id LIMIT 50 OFFSET ${(page - 1) * 50}) p), '[]'::jsonb),
          'refunds', COALESCE((SELECT jsonb_agg(p ORDER BY p.id) FROM (SELECT * FROM refunds ORDER BY id LIMIT 50 OFFSET ${(page - 1) * 50}) p), '[]'::jsonb)
        ) AS result`;
      return { ...row.result, page, pageSize: 50, timezone: 'Asia/Jakarta' };
    });
  }
  sales(auth: unknown, query: unknown) {
    const { from, to, page } = range(query);
    return this.identity.authenticated(auth, async (tx, account) => {
      if (account.role !== 'admin') throw new ForbiddenException();
      // One statement gives count, total, product aggregation and page one MVCC snapshot.
      const [row] = await tx.$queryRaw<{ result: object }[]>`
        WITH effective AS (
          SELECT s.id, s."occurredAt", r.amount FROM "Sale" s JOIN "Receipt" r ON r."saleId"=s.id
          WHERE s."correctedById" IS NULL AND s."cancelledAt" IS NULL
            AND s."occurredAt">=${from} AND s."occurredAt"<${to}
        ), products AS (
          SELECT i."productId", SUM(i.quantity) AS quantity, SUM(i."unitPrice"::bigint*i.quantity) AS amount
          FROM "SaleItem" i JOIN effective e ON e.id=i."saleId" GROUP BY i."productId"
        ) SELECT jsonb_build_object(
          'total', (SELECT COALESCE(SUM(amount),0) FROM effective),
          'count', (SELECT COUNT(*) FROM effective),
          'products', COALESCE((SELECT jsonb_agg(p ORDER BY p."productId") FROM products p), '[]'::jsonb),
          'items', COALESCE((SELECT jsonb_agg(p ORDER BY p.id) FROM
            (SELECT * FROM effective ORDER BY id LIMIT 50 OFFSET ${(page - 1) * 50}) p), '[]'::jsonb)
        ) AS result`;
      return { ...row.result, page, pageSize: 50, timezone: 'Asia/Jakarta' };
    });
  }
}
