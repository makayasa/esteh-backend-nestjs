import 'dotenv/config';
import { createDatabase } from './database.js';
import { credentials } from './input.js';
import { hashPassword } from './identity/password.js';

let db: ReturnType<typeof createDatabase> | undefined;
try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 2048) throw new Error('Input too large');
  }
  const value = credentials(JSON.parse(input));
  const passwordHash = await hashPassword(value.password);
  db = createDatabase();
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(71001)`;
    if ((await tx.account.count()) !== 0)
      throw new Error('Already bootstrapped');
    const account = await tx.account.create({
      data: { username: value.username, passwordHash, role: 'admin' },
    });
    await tx.audit.create({
      data: {
        actorId: account.id,
        objectId: account.id,
        action: 'account.bootstrap',
        createdAt: new Date(),
      },
    });
  });
  console.log('Admin dibuat');
} catch {
  console.error(
    'Bootstrap ditolak: periksa input, database, atau akun yang sudah ada.',
  );
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
}
