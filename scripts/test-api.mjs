// PostgreSQL/CLI/HTTP acceptance checks; only synthetic data in dedicated container.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { Client } from 'pg';

const container = `esteh-api-test-${process.pid}`;
const password = randomBytes(24).toString('hex');
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0)
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
};
let server;
let db;
try {
  run('docker', [
    'run',
    '-d',
    '--name',
    container,
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-e',
    'POSTGRES_DB=esteh_test',
    '-p',
    '127.0.0.1::5432',
    'postgres:17-alpine@sha256:f02121de6f74d30d8a94cd1d9584125e2178d7e6c377d8130112d4e52d867995',
  ]);
  for (let i = 0; ; i++) {
    if (
      spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'])
        .status === 0
    )
      break;
    if (i === 60) throw new Error('Test DB timeout');
    await new Promise((r) => setTimeout(r, 250));
  }
  const port = run('docker', ['port', container, '5432/tcp']).split(':').at(-1);
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const appPort = probe.address().port;
  await new Promise((r) => probe.close(r));
  const env = {
    ...process.env,
    DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/esteh_test`,
    SESSION_SECRET: randomBytes(32).toString('hex'),
    HOST: '127.0.0.1',
    PORT: String(appPort),
  };
  run('npx', ['prisma', 'migrate', 'deploy'], { env });
  const credentials = {
    username: 'admin',
    password: 'synthetic-admin-password-123',
  };
  const bootstrap = spawnSync('node', ['dist/bootstrap-admin.js'], {
    env,
    input: JSON.stringify(credentials),
    encoding: 'utf8',
  });
  assert.equal(bootstrap.status, 0, bootstrap.stderr);
  assert(!bootstrap.stdout.includes(credentials.password));
  console.log('PASS bootstrap CLI');
  assert.equal(
    spawnSync('node', ['dist/bootstrap-admin.js'], {
      env,
      input: JSON.stringify(credentials),
    }).status,
    1,
  );
  let logs = '';
  server = spawn('node', ['dist/main.js'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => {
    logs += chunk;
  });
  server.stderr.on('data', (chunk) => {
    logs += chunk;
  });
  const api = async (path, body, token, key = 'request-key-0001') => {
    const response = await fetch(`http://127.0.0.1:${appPort}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  for (let i = 0; ; i++) {
    try {
      await fetch(`http://127.0.0.1:${appPort}/health`);
      break;
    } catch {
      if (i === 100) throw new Error(`App startup failed: ${logs}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const login = await api('/auth/login', credentials);
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.match(login.body.token, /^[A-Za-z0-9_-]{43}$/);
  const me = await api('/auth/me', undefined, login.body.token);
  assert.equal(me.status, 200);
  assert.equal(me.body.username, 'admin');
  assert.equal(me.body.role, 'admin');
  db = new Client({ connectionString: env.DATABASE_URL });
  await db.connect();
  const rows = (await db.query('SELECT * FROM "Session"')).rows;
  assert.equal(rows.length, 1);
  assert(!JSON.stringify(rows).includes(login.body.token));
  const account = (await db.query('SELECT * FROM "Account"')).rows[0];
  assert.match(account.passwordHash, /^\u0024argon2id\u0024/);
  assert.equal((await api('/docs/openapi.json')).status, 401);
  assert.equal(
    (await api('/docs/openapi.json', undefined, login.body.token)).status,
    200,
  );
  assert.equal(
    (await api('/auth/login', { ...credentials, extra: 'invalid' })).status,
    400,
  );
  assert.equal(
    (await api('/auth/login', credentials, undefined, 'bad')).status,
    400,
  );
  console.log(
    'PASS login + identity + token hash + protected OpenAPI + validation',
  );
  const retries = await Promise.all(
    Array.from({ length: 4 }, () => api('/auth/login', credentials)),
  );
  for (const retry of retries) assert.deepEqual(retry, login);
  assert.equal(
    (await db.query('SELECT count(*)::int AS n FROM "Session"')).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM "Audit" WHERE action = $1',
        ['session.login'],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await api('/auth/login', {
        ...credentials,
        password: 'wrong-password-12345',
      })
    ).status,
    401,
  );
  await db.query('UPDATE "Account" SET active = false');
  assert.equal((await api('/auth/login', credentials)).status, 401);
  assert.equal(
    (await api('/auth/me', undefined, login.body.token)).status,
    401,
  );
  await db.query('UPDATE "Account" SET active = true');
  const { hashPassword } = await import('../dist/identity/password.js');
  const changed = {
    ...credentials,
    password: 'synthetic-changed-password-123',
  };
  await db.query('UPDATE "Account" SET "passwordHash" = $1', [
    await hashPassword(changed.password),
  ]);
  assert.equal((await api('/auth/login', changed)).status, 409);
  await db.query('UPDATE "Account" SET "passwordHash" = $1', [
    account.passwordHash,
  ]);
  await db.query('DELETE FROM "LoginLimit"');
  assert.equal(
    (
      await api('/auth/login', {
        username: 'unknown',
        password: credentials.password,
      })
    ).status,
    401,
  );
  assert.equal((await api('/auth/register', credentials)).status, 404);
  // Fault at audit insert proves session + idempotency roll back with business transaction.
  await db.query(
    `CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic fault'; END $$`,
  );
  await db.query(
    'CREATE TRIGGER reject_audit BEFORE INSERT ON "Audit" FOR EACH ROW EXECUTE FUNCTION reject_audit()',
  );
  const failed = await api(
    '/auth/login',
    credentials,
    undefined,
    'rollback-key-0001',
  );
  assert.equal(failed.status, 500);
  assert(!JSON.stringify(failed.body).includes('synthetic fault'));
  assert.equal(
    (await db.query('SELECT count(*)::int AS n FROM "Session"')).rows[0].n,
    1,
  );
  assert.equal(
    (await db.query('SELECT count(*)::int AS n FROM "Idempotency"')).rows[0].n,
    1,
  );
  await db.query('DROP TRIGGER reject_audit ON "Audit"');
  let limited;
  for (let i = 0; i < 12; i++)
    limited = await api('/auth/login', {
      ...credentials,
      password: 'wrong-password-12345',
    });
  assert.equal(limited.status, 429);
  assert(!logs.includes(credentials.password));
  assert(!logs.includes(login.body.token));
  assert(
    !JSON.stringify((await db.query('SELECT * FROM "Audit"')).rows).includes(
      credentials.password,
    ),
  );
  console.log(
    'PASS concurrent login replay, inactive, wrong password, rollback, rate limit, secret audit',
  );
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../dist/app.module.js');
  const { Clock } = await import('../dist/clock.js');
  const { configureHttp } = await import('../dist/http.js');
  Object.assign(process.env, env);
  let time = new Date('2026-09-20T00:00:00Z');
  const fixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue({ now: () => new Date(time) })
    .compile();
  const app = fixture.createNestApplication({
    logger: false,
    bodyParser: false,
  });
  configureHttp(app);
  await app.listen(0, '127.0.0.1');
  try {
    const clockApi = async (path, body, token, key) => {
      const res = await fetch(`${await app.getUrl()}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': key ?? 'clock-request-0001',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: res.status, body: await res.json() };
    };
    await db.query('DELETE FROM "LoginLimit"');
    const idle = await clockApi(
      '/auth/login',
      credentials,
      undefined,
      'clock-idle-0001',
    );
    assert.equal(idle.status, 200);
    time = new Date(time.getTime() + 12 * 3600000);
    assert.equal(
      (await clockApi('/auth/me', undefined, idle.body.token)).status,
      401,
    );
    const absolute = await clockApi(
      '/auth/login',
      credentials,
      undefined,
      'clock-absolute-0001',
    );
    for (let hour = 1; hour < 168; hour++) {
      time = new Date(time.getTime() + 3600000);
      assert.equal(
        (await clockApi('/auth/me', undefined, absolute.body.token)).status,
        200,
      );
    }
    time = new Date(time.getTime() + 3600000);
    assert.equal(
      (await clockApi('/auth/me', undefined, absolute.body.token)).status,
      401,
    );
    const logout = await clockApi(
      '/auth/login',
      credentials,
      undefined,
      'clock-logout-0001',
    );
    assert.equal(
      (await clockApi('/auth/logout', {}, logout.body.token)).status,
      200,
    );
    assert.equal(
      (await clockApi('/auth/logout', {}, logout.body.token)).status,
      401,
    );
    assert.equal(
      (await clockApi('/auth/me', undefined, logout.body.token)).status,
      401,
    );
    assert.equal(
      (
        await clockApi(
          '/auth/login',
          credentials,
          undefined,
          'clock-logout-0001',
        )
      ).status,
      401,
    );
    console.log(
      'PASS idle 12h, absolute 7d despite activity, logout/revoked replay',
    );
    const admin = (
      await clockApi('/auth/login', credentials, undefined, 'accounts-admin-01')
    ).body.token;
    const employee = {
      username: 'employee',
      password: 'synthetic-employee-password-123',
      role: 'employee',
    };
    const created = await clockApi(
      '/accounts',
      employee,
      admin,
      'create-employee-01',
    );
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const employeeCredentials = {
      username: employee.username,
      password: employee.password,
    };
    const employeeToken = (
      await clockApi(
        '/auth/login',
        employeeCredentials,
        undefined,
        'employee-login-01',
      )
    ).body.token;
    assert.equal(
      (
        await clockApi(
          '/accounts',
          employee,
          employeeToken,
          'employee-write-01',
        )
      ).status,
      403,
    );
    assert.equal(
      (await clockApi('/accounts', undefined, admin)).body.items.length,
      2,
    );
    const repeats = await Promise.all(
      Array.from({ length: 3 }, () =>
        clockApi('/accounts', employee, admin, 'create-employee-01'),
      ),
    );
    for (const repeat of repeats) assert.deepEqual(repeat, created);
    assert.equal(
      (
        await clockApi(
          '/accounts',
          { ...employee, username: 'another' },
          admin,
          'create-employee-01',
        )
      ).status,
      409,
    );
    const secondEmployee = (
      await clockApi(
        '/auth/login',
        employeeCredentials,
        undefined,
        'employee-login-02',
      )
    ).body.token;
    assert.equal(
      (
        await clockApi(
          `/accounts/${created.body.id}/reset-password`,
          { password: 'synthetic-new-password-123' },
          admin,
          'reset-employee-01',
        )
      ).status,
      200,
    );
    for (const token of [employeeToken, secondEmployee])
      assert.equal((await clockApi('/auth/me', undefined, token)).status, 401);
    const freshEmployee = (
      await clockApi(
        '/auth/login',
        { ...employeeCredentials, password: 'synthetic-new-password-123' },
        undefined,
        'employee-login-03',
      )
    ).body.token;
    assert.equal(
      (
        await clockApi(
          `/accounts/${created.body.id}/deactivate`,
          {},
          admin,
          'deactivate-employee-01',
        )
      ).status,
      200,
    );
    assert.equal(
      (await clockApi('/auth/me', undefined, freshEmployee)).status,
      401,
    );
    const beforeCounts = (
      await db.query(
        'SELECT (SELECT count(*) FROM "Account")::int AS accounts, (SELECT count(*) FROM "Audit")::int AS audits, (SELECT count(*) FROM "Idempotency")::int AS keys',
      )
    ).rows[0];
    await db.query(
      'CREATE TRIGGER reject_audit BEFORE INSERT ON "Audit" FOR EACH ROW EXECUTE FUNCTION reject_audit()',
    );
    assert.equal(
      (
        await clockApi(
          '/accounts',
          { ...employee, username: 'rollback-user' },
          admin,
          'rollback-account-01',
        )
      ).status,
      500,
    );
    const afterCounts = (
      await db.query(
        'SELECT (SELECT count(*) FROM "Account")::int AS accounts, (SELECT count(*) FROM "Audit")::int AS audits, (SELECT count(*) FROM "Idempotency")::int AS keys',
      )
    ).rows[0];
    assert.deepEqual(afterCounts, beforeCounts);
    await db.query('DROP TRIGGER reject_audit ON "Audit"');
    const persisted =
      JSON.stringify((await db.query('SELECT * FROM "Audit"')).rows) +
      JSON.stringify((await db.query('SELECT * FROM "Idempotency"')).rows);
    assert(!persisted.includes(employee.password));
    assert(!persisted.includes('synthetic-new-password-123'));
    console.log(
      'PASS admin accounts, role denial, concurrent replay, reset/deactivate revoke all, atomic rollback',
    );
    const regular = await clockApi(
      '/products',
      { name: 'Teh Regular', price: 5000, available: true },
      admin,
      'product-regular-01',
    );
    assert.equal(regular.status, 200, JSON.stringify(regular.body));
    const jumbo = await clockApi(
      '/products',
      { name: 'Teh Jumbo', price: 8000, available: false },
      admin,
      'product-jumbo-01',
    );
    assert.equal(jumbo.status, 200);
    assert.notEqual(regular.body.id, jumbo.body.id);
    assert.equal(
      (
        await clockApi(
          '/products',
          { name: 'Invalid', price: 0.5, available: true },
          admin,
          'product-invalid-01',
        )
      ).status,
      400,
    );
    const reader = {
      username: 'reader',
      password: 'synthetic-reader-password-123',
      role: 'employee',
    };
    await clockApi('/accounts', reader, admin, 'reader-create-01');
    const readerToken = (
      await clockApi(
        '/auth/login',
        { username: reader.username, password: reader.password },
        undefined,
        'reader-login-01',
      )
    ).body.token;
    assert.equal(
      (
        await clockApi(
          '/products',
          { name: 'Forged', price: 1, available: true },
          readerToken,
          'product-forged-01',
        )
      ).status,
      403,
    );
    const products = await clockApi('/products?page=1', undefined, readerToken);
    assert.equal(products.status, 200);
    assert.equal(products.body.items.length, 2);
    assert.equal(
      (await clockApi('/products?page=0', undefined, admin)).status,
      400,
    );
    const updated = await clockApi(
      `/products/${regular.body.id}`,
      { name: 'Teh Regular', price: 6000, available: false, active: true },
      admin,
      'product-update-01',
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body.price, 6000);
    const disabled = await clockApi(
      `/products/${regular.body.id}`,
      { name: 'Teh Regular', price: 6000, available: false, active: false },
      admin,
      'product-disable-01',
    );
    assert.equal(disabled.status, 200);
    assert.equal(
      (await clockApi('/products', undefined, admin)).body.items.length,
      2,
    );
    console.log(
      'PASS products variants, price/availability, role, pagination and non-destructive deactivate',
    );
    const material = await clockApi(
      '/materials',
      { name: 'Gula', unit: 'gram', quantityScale: 3 },
      admin,
      'material-create-01',
    );
    assert.equal(material.status, 200, JSON.stringify(material.body));
    assert.equal(material.body.unit, 'gram');
    assert.equal(material.body.quantityScale, 3);
    assert.equal(
      (
        await clockApi(
          '/materials',
          { name: 'Cup', unit: 'pcs', quantityScale: 0.5 },
          admin,
          'material-invalid-01',
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await clockApi(
          '/materials',
          { name: 'Cup', unit: 'pcs', quantityScale: 0 },
          readerToken,
          'material-forged-01',
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await clockApi(
          `/materials/${material.body.id}`,
          { name: 'Gula', unit: 'kg', active: true },
          admin,
          'material-unit-01',
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await clockApi(
          `/materials/${material.body.id}`,
          { name: 'Gula', quantityScale: 0, active: true },
          admin,
          'material-scale-01',
        )
      ).status,
      400,
    );
    const retired = await clockApi(
      `/materials/${material.body.id}`,
      { name: 'Gula lama', active: false },
      admin,
      'material-disable-01',
    );
    assert.equal(retired.status, 200);
    assert.equal(retired.body.id, material.body.id);
    assert.equal(retired.body.unit, 'gram');
    assert.equal(
      (await clockApi('/materials', undefined, admin)).body.items.length,
      1,
    );
    await assert.rejects(
      db.query('UPDATE "Material" SET unit = $1 WHERE id = $2', [
        'kg',
        material.body.id,
      ]),
    );
    await assert.rejects(
      db.query('UPDATE "Material" SET "quantityScale" = 0 WHERE id = $1', [
        material.body.id,
      ]),
    );
    // Synthetic FK consumer, not implementation of future inventory module.
    await db.query(
      'CREATE TABLE material_reference_probe (id int PRIMARY KEY, material_id text REFERENCES "Material"(id))',
    );
    await db.query('INSERT INTO material_reference_probe VALUES (1, $1)', [
      material.body.id,
    ]);
    await clockApi(
      `/materials/${material.body.id}`,
      { name: 'Gula arsip', active: false },
      admin,
      'material-disable-02',
    );
    const reference = (
      await db.query(
        'SELECT m.id, m.unit, m."quantityScale", m.active FROM "Material" m JOIN material_reference_probe r ON r.material_id=m.id',
      )
    ).rows[0];
    assert.deepEqual(reference, {
      id: material.body.id,
      unit: 'gram',
      quantityScale: 3,
      active: false,
    });
    const materialRetries = await Promise.all(
      Array.from({ length: 3 }, () =>
        clockApi(
          '/materials',
          { name: 'Gula', unit: 'gram', quantityScale: 3 },
          admin,
          'material-create-01',
        ),
      ),
    );
    for (const repeat of materialRetries) assert.deepEqual(repeat, material);
    assert.equal(
      (
        await clockApi(
          '/materials',
          { name: 'Gula', unit: 'gram', quantityScale: 0 },
          admin,
          'material-create-01',
        )
      ).status,
      409,
    );
    console.log(
      'PASS materials fixed unit/scale DB invariant, validation, role, retained FK, concurrent replay',
    );
    const readerAccount = (await clockApi('/auth/me', undefined, readerToken))
      .body;
    await db.query(
      'CREATE TRIGGER reject_audit BEFORE INSERT ON "Audit" FOR EACH ROW EXECUTE FUNCTION reject_audit()',
    );
    const resetFailure = await clockApi(
      `/accounts/${readerAccount.id}/reset-password`,
      { password: 'synthetic-rollback-password-123' },
      admin,
      'rollback-reset-01',
    );
    assert.equal(resetFailure.status, 500);
    assert.equal(
      (await clockApi('/auth/me', undefined, readerToken)).status,
      200,
    );
    const productFailure = await clockApi(
      '/products',
      { name: 'Rollback', price: 999, available: true },
      admin,
      'rollback-product-01',
    );
    assert.equal(productFailure.status, 500);
    assert.equal(
      (await clockApi('/products', undefined, admin)).body.items.length,
      2,
    );
    await db.query('DROP TRIGGER reject_audit ON "Audit"');
    await db.query('UPDATE "Account" SET role = $1 WHERE username = $2', [
      'employee',
      'admin',
    ]);
    assert.equal(
      (await clockApi('/accounts', employee, admin, 'create-employee-01'))
        .status,
      403,
    );
    await db.query('UPDATE "Account" SET role = $1 WHERE username = $2', [
      'admin',
      'admin',
    ]);
    assert.equal(
      (await clockApi('/docs/openapi.json', undefined, readerToken)).status,
      403,
    );
    console.log(
      'PASS reset/catalog rollback and current role checked before replay',
    );
    // P4/issue #8: penjualan tunai end-to-end dengan snapshot harga.
    const manis = await clockApi(
      '/products',
      { name: 'Teh Manis', price: 5000, available: true },
      admin,
      'product-manis-01',
    );
    assert.equal(manis.status, 200, JSON.stringify(manis.body));
    const pahit = await clockApi(
      '/products',
      { name: 'Teh Pahit', price: 7000, available: false },
      admin,
      'product-pahit-01',
    );
    assert.equal(pahit.status, 200);
    const saleInput = {
      items: [{ productId: manis.body.id, quantity: 2 }],
    };
    const sale = await clockApi(
      '/sales',
      saleInput,
      readerToken,
      'sale-create-01',
    );
    assert.equal(sale.status, 200, JSON.stringify(sale.body));
    assert.equal(sale.body.total, 10000);
    assert.equal(sale.body.receipt.method, 'cash');
    assert.equal(sale.body.receipt.amount, 10000);
    assert.equal(sale.body.items[0].unitPrice, 5000);
    assert.equal(sale.body.items[0].name, 'Teh Manis');
    assert(!('amountReceived' in sale.body));
    assert(!('changeDue' in sale.body));
    assert.equal(sale.body.occurredAt, new Date(time).toISOString());
    // Client cannot override backend-computed money or time fields.
    for (const forged of [
      { ...saleInput, total: 1 },
      { ...saleInput, occurredAt: '2020-01-01T00:00:00Z' },
      { ...saleInput, items: [{ ...saleInput.items[0], unitPrice: 1 }] },
      { ...saleInput, items: [{ ...saleInput.items[0], quantity: 0 }] },
      {
        ...saleInput,
        items: [{ productId: pahit.body.id, quantity: 1 }],
      },
    ])
      assert.equal(
        (await clockApi('/sales', forged, readerToken, 'sale-forged-01'))
          .status,
        400,
      );
    // Snapshot: price change does not rewrite the recorded sale.
    assert.equal(
      (
        await clockApi(
          `/products/${manis.body.id}`,
          { name: 'Teh Manis', price: 6500, available: true, active: true },
          admin,
          'product-reprice-01',
        )
      ).status,
      200,
    );
    const snapshot = await clockApi(
      `/sales/${sale.body.id}`,
      undefined,
      readerToken,
    );
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.body.items[0].unitPrice, 5000);
    assert.equal(snapshot.body.receipt.amount, 10000);
    // Retry identik tidak membuat penjualan/penerimaan baru.
    const saleRetries = await Promise.all(
      Array.from({ length: 3 }, () =>
        clockApi('/sales', saleInput, readerToken, 'sale-create-01'),
      ),
    );
    for (const repeat of saleRetries) assert.deepEqual(repeat, sale);
    assert.equal(
      (
        await clockApi(
          '/sales',
          { ...saleInput, items: [{ ...saleInput.items[0], quantity: 3 }] },
          readerToken,
          'sale-create-01',
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await db.query('SELECT count(*)::int AS n FROM "Sale"')
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query('SELECT count(*)::int AS n FROM "Receipt"')
      ).rows[0].n,
      1,
    );
    // DB invariant: nominal penerimaan selalu sama dengan total backend.
    await assert.rejects(
      db.query('UPDATE "Receipt" SET amount = 1 WHERE "saleId" = $1', [
        sale.body.id,
      ]),
    );
    await assert.rejects(
      db.query(
        `INSERT INTO "Receipt" (id, "saleId", method, amount, "receivedAt", "receivedBy")
         VALUES (gen_random_uuid()::text, $1, 'cash', 999, now(), $2)`,
        [sale.body.id, readerAccount.id],
      ),
    );
    // Rollback: kegagalan audit membatalkan penjualan + item + penerimaan.
    const beforeSaleCounts = (
      await db.query(
        'SELECT (SELECT count(*) FROM "Sale")::int AS sales, (SELECT count(*) FROM "SaleItem")::int AS items, (SELECT count(*) FROM "Receipt")::int AS receipts',
      )
    ).rows[0];
    await db.query(
      'CREATE TRIGGER reject_audit BEFORE INSERT ON "Audit" FOR EACH ROW EXECUTE FUNCTION reject_audit()',
    );
    assert.equal(
      (
        await clockApi('/sales', saleInput, readerToken, 'rollback-sale-01')
      ).status,
      500,
    );
    await db.query('DROP TRIGGER reject_audit ON "Audit"');
    const afterSaleCounts = (
      await db.query(
        'SELECT (SELECT count(*) FROM "Sale")::int AS sales, (SELECT count(*) FROM "SaleItem")::int AS items, (SELECT count(*) FROM "Receipt")::int AS receipts',
      )
    ).rows[0];
    assert.deepEqual(afterSaleCounts, beforeSaleCounts);
    // Izin: karyawan melihat transaksi sendiri hari WIB berjalan saja.
    const adminSale = await clockApi(
      '/sales',
      { items: [{ productId: manis.body.id, quantity: 1 }] },
      admin,
      'sale-admin-01',
    );
    assert.equal(adminSale.status, 200);
    const readerList = await clockApi('/sales', undefined, readerToken);
    assert.deepEqual(
      readerList.body.items.map((row) => row.id),
      [sale.body.id],
    );
    assert.equal(
      (await clockApi(`/sales/${adminSale.body.id}`, undefined, readerToken))
        .status,
      404,
    );
    assert.equal(
      (await clockApi('/sales', undefined, admin)).body.items.length,
      2,
    );
    // Karyawan tidak bisa memundurkan tanggal: tanpa field tanggal pada payload;
    // pergeseran waktu kejadian di DB mengeluarkannya dari akses hari berjalan.
    await db.query('UPDATE "Sale" SET "occurredAt" = $1 WHERE id = $2', [
      '2026-09-26T10:00:00Z',
      sale.body.id,
    ]);
    assert.equal(
      (await clockApi('/sales', undefined, readerToken)).body.items.length,
      0,
    );
    assert.equal(
      (await clockApi(`/sales/${sale.body.id}`, undefined, readerToken))
        .status,
      404,
    );
    assert.equal(
      (await clockApi('/sales', undefined, admin)).body.items.length,
      2,
    );
    console.log(
      'PASS cash sales total/snapshot/idempotency/rollback/permissions/WIB scope',
    );
  } finally {
    await app.close();
  }
} finally {
  server?.kill('SIGTERM');
  await db?.end();
  spawnSync('docker', ['rm', '-f', '-v', container], { stdio: 'ignore' });
}
