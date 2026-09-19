import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdentityService } from './identity.service.js';
import { hashPassword } from './password.js';
import { credentials, object, text } from '../input.js';
import { Clock } from '../clock.js';

const select = { id: true, username: true, role: true, active: true } as const;

@Injectable()
export class AccountsService {
  constructor(
    private readonly identity: IdentityService,
    private readonly clock: Clock,
  ) {}

  list(auth: unknown, page = '1') {
    if (!/^[1-9]\d{0,5}$/.test(page))
      throw new BadRequestException('Page invalid');
    return this.identity.authenticated(auth, async (tx, account) => {
      if (account.role !== 'admin') throw new ForbiddenException();
      return {
        items: await tx.account.findMany({
          select,
          orderBy: { id: 'asc' },
          take: 50,
          skip: (Number(page) - 1) * 50,
        }),
      };
    });
  }
  create(auth: unknown, key: unknown, input: unknown) {
    const data = object(input, ['username', 'password', 'role']);
    const value = credentials({
      username: data.username,
      password: data.password,
    });
    const role = text(data.role, 1, 16);
    if (!['admin', 'employee'].includes(role))
      throw new BadRequestException('Role invalid');
    return this.identity.write(
      auth,
      'account.create',
      key,
      { ...value, role },
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`username:${value.username}`}, 0))`;
        if (
          await tx.account.findUnique({ where: { username: value.username } })
        )
          throw new ConflictException('Username sudah ada');
        const result = await tx.account.create({
          data: {
            username: value.username,
            passwordHash: await hashPassword(value.password),
            role,
          },
          select,
        });
        return { result, objectId: result.id };
      },
    );
  }
  reset(auth: unknown, key: unknown, id: string, input: unknown) {
    const data = object(input, ['password']);
    const password = text(data.password, 12, 128);
    return this.identity.write(
      auth,
      'account.reset',
      key,
      { id, password },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${id} FOR UPDATE`;
        if (!(await tx.account.findUnique({ where: { id } })))
          throw new NotFoundException();
        await tx.account.update({
          where: { id },
          data: { passwordHash: await hashPassword(password) },
        });
        await tx.session.updateMany({
          where: { accountId: id, revokedAt: null },
          data: { revokedAt: this.clock.now() },
        });
        return { result: { id }, objectId: id };
      },
    );
  }
  deactivate(auth: unknown, key: unknown, id: string, input: unknown) {
    object(input, []);
    return this.identity.write(
      auth,
      'account.deactivate',
      key,
      { id },
      async (tx, actorId) => {
        if (id === actorId)
          throw new BadRequestException(
            'Tidak dapat menonaktifkan diri sendiri',
          );
        await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${id} FOR UPDATE`;
        if (!(await tx.account.findUnique({ where: { id } })))
          throw new NotFoundException();
        await tx.account.update({ where: { id }, data: { active: false } });
        await tx.session.updateMany({
          where: { accountId: id, revokedAt: null },
          data: { revokedAt: this.clock.now() },
        });
        return { result: { id }, objectId: id };
      },
    );
  }
}
