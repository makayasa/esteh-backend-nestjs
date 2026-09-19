import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { Database } from '../database.js';
import { Clock } from '../clock.js';
import { credentials, text, object } from '../input.js';
import { hashPassword, verifyPassword } from './password.js';
import type { Prisma } from '../generated/prisma/client.js';

const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class IdentityService {
  private readonly secret: string;
  private readonly dummy = hashPassword(randomUUID());
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {
    const secret = process.env.SESSION_SECRET;
    if (!secret || !/^[a-f0-9]{64}$/.test(secret))
      throw new Error('SESSION_SECRET harus 32 byte hex acak');
    this.secret = secret;
  }
  private token(id: string) {
    return createHmac('sha256', this.secret)
      .update(`session:${id}`)
      .digest('base64url');
  }
  private expired(session: {
    createdAt: Date;
    lastSeenAt: Date;
    revokedAt: Date | null;
  }) {
    const now = this.clock.now().getTime();
    return (
      session.revokedAt !== null ||
      now - session.lastSeenAt.getTime() >= 12 * 3600000 ||
      now - session.createdAt.getTime() >= 7 * 86400000
    );
  }
  async login(input: unknown, requestKey: unknown, ip: string) {
    const value = credentials(input);
    const key = text(requestKey, 8, 128);
    const now = this.clock.now();
    // Limits persist across restart and are committed even when login fails.
    for (const [bucket, maximum] of [
      [`ip:${ip}`, 50],
      [`user:${value.username}`, 10],
    ] as const) {
      const count = await this.db.client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${bucket}, 0))`;
        const old = await tx.loginLimit.findUnique({
          where: { bucket: digest(bucket) },
        });
        const fresh = !old || now.getTime() - old.startAt.getTime() >= 900000;
        return (
          await tx.loginLimit.upsert({
            where: { bucket: digest(bucket) },
            create: { bucket: digest(bucket), startAt: now, count: 1 },
            update: fresh
              ? { startAt: now, count: 1 }
              : { count: { increment: 1 } },
          })
        ).count;
      });
      if (count > maximum)
        throw new HttpException('Terlalu banyak percobaan login', 429);
    }
    const account = await this.db.client.account.findUnique({
      where: { username: value.username },
    });
    const valid = await verifyPassword(
      value.password,
      account?.passwordHash ?? (await this.dummy),
    );
    if (!account || !valid || !account.active)
      throw new UnauthorizedException('Kredensial invalid');
    return this.db.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${account.id} FOR UPDATE`;
      const current = await tx.account.findUniqueOrThrow({
        where: { id: account.id },
      });
      if (!current.active || current.passwordHash !== account.passwordHash)
        throw new UnauthorizedException();
      const payloadHash = createHmac('sha256', this.secret)
        .update(JSON.stringify(value))
        .digest('hex');
      const scope = { actorId: account.id, operation: 'login', key };
      const previous = await tx.idempotency.findUnique({
        where: { actorId_operation_key: scope },
      });
      if (previous) {
        if (previous.payloadHash !== payloadHash)
          throw new ConflictException('Idempotency payload berbeda');
        if (typeof previous.result !== 'string')
          throw new UnauthorizedException();
        const session = await tx.session.findUnique({
          where: { id: previous.result },
        });
        if (
          !session ||
          this.expired(session) ||
          session.tokenHash !== digest(this.token(session.id))
        )
          throw new UnauthorizedException();
        return { token: this.token(session.id) };
      }
      const id = randomUUID();
      const token = this.token(id);
      await tx.session.create({
        data: {
          id,
          accountId: account.id,
          tokenHash: digest(token),
          createdAt: now,
          lastSeenAt: now,
        },
      });
      await tx.audit.create({
        data: {
          actorId: account.id,
          objectId: id,
          action: 'session.login',
          createdAt: now,
        },
      });
      await tx.idempotency.create({
        data: { ...scope, payloadHash, result: id },
      });
      return { token };
    });
  }

  async authenticated<T>(
    authorization: unknown,
    action: (
      tx: Prisma.TransactionClient,
      account: { id: string; username: string; role: string },
      sessionId: string,
    ) => Promise<T>,
  ): Promise<T> {
    if (
      typeof authorization !== 'string' ||
      !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)
    )
      throw new UnauthorizedException();
    const tokenHash = digest(authorization.slice(7));
    return this.db.client.$transaction(async (tx) => {
      const candidate = await tx.session.findUnique({ where: { tokenHash } });
      if (!candidate) throw new UnauthorizedException();
      await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${candidate.accountId} FOR UPDATE`;
      const session = await tx.session.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      const account = await tx.account.findUniqueOrThrow({
        where: { id: candidate.accountId },
      });
      if (
        !account.active ||
        this.expired(session) ||
        digest(this.token(session.id)) !== tokenHash
      )
        throw new UnauthorizedException();
      await tx.session.update({
        where: { id: session.id },
        data: { lastSeenAt: this.clock.now() },
      });
      return action(
        tx,
        { id: account.id, username: account.username, role: account.role },
        session.id,
      );
    });
  }
  write(
    authorization: unknown,
    operation: string,
    requestKey: unknown,
    payload: Prisma.InputJsonValue,
    action: (
      tx: Prisma.TransactionClient,
      actorId: string,
    ) => Promise<{ result: Prisma.InputJsonValue; objectId: string }>,
    roles: readonly string[] = ['admin'],
  ) {
    const key = text(requestKey, 8, 128);
    return this.authenticated(authorization, async (tx, account) => {
      if (!roles.includes(account.role)) throw new ForbiddenException();
      const scope = { actorId: account.id, operation, key };
      const payloadHash = createHmac('sha256', this.secret)
        .update(JSON.stringify(payload))
        .digest('hex');
      const previous = await tx.idempotency.findUnique({
        where: { actorId_operation_key: scope },
      });
      if (previous) {
        if (previous.payloadHash !== payloadHash)
          throw new ConflictException('Idempotency payload berbeda');
        return previous.result;
      }
      const { result, objectId } = await action(tx, account.id);
      await tx.audit.create({
        data: {
          actorId: account.id,
          objectId,
          action: operation,
          createdAt: this.clock.now(),
        },
      });
      await tx.idempotency.create({ data: { ...scope, payloadHash, result } });
      return result;
    });
  }
  logout(authorization: unknown, key: unknown, input: unknown) {
    text(key, 8, 128);
    object(input, []);
    return this.authenticated(authorization, async (tx, account, sessionId) => {
      const scope = {
        actorId: account.id,
        operation: 'session.logout',
        key: text(key, 8, 128),
      };
      const payloadHash = createHmac('sha256', this.secret)
        .update(sessionId)
        .digest('hex');
      const previous = await tx.idempotency.findUnique({
        where: { actorId_operation_key: scope },
      });
      if (previous && previous.payloadHash !== payloadHash)
        throw new ConflictException('Idempotency payload berbeda');
      const now = this.clock.now();
      await tx.session.update({
        where: { id: sessionId },
        data: { revokedAt: now },
      });
      await tx.audit.create({
        data: {
          actorId: account.id,
          objectId: sessionId,
          action: 'session.logout',
          createdAt: now,
        },
      });
      await tx.idempotency.create({
        data: { ...scope, payloadHash, result: { status: 'ok' } },
      });
      // Auth precedes replay: repeat with revoked session always returns 401.
      return { status: 'ok' };
    });
  }
  me(authorization: unknown) {
    return this.authenticated(authorization, async (_tx, account) => account);
  }
}
