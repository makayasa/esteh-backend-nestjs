// Generate Postman collection + environment dari OpenAPI yang sedang berjalan.
// Output: postman/esteh.postman_collection.json (shareable, tanpa secret) dan
// .tmp/esteh-local.postman_environment.json (privat, berisi kredensial lokal).
// Jalankan saat stack hidup: node scripts/make-postman.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chmodSync } from 'node:fs';
import path from 'node:path';

const specUrl = process.argv[2] ?? 'http://127.0.0.1:3000/docs/openapi.json';
const spec = await (await fetch(specUrl)).json();

const WIB = '2026-01-05T08:00:00+07:00';
// body contoh; {{...}} dipakai dari environment/hasil test sebelumnya.
const bodies = {
  '/auth/login': { username: '{{username}}', password: '{{password}}' },
  '/auth/logout': {},
  '/accounts': {
    username: '{{newUsername}}',
    password: '{{newPassword}}',
    role: 'employee',
  },
  '/accounts/{id}/reset-password': { password: '{{newPassword}}' },
  '/accounts/{id}/deactivate': {},
  '/products': { name: 'Es Teh Regular', price: 5000, available: true },
  '/products/{id}': {
    name: 'Es Teh Regular',
    price: 5000,
    available: true,
    active: true,
  },
  '/materials': { name: 'Gula', unit: 'gram', quantityScale: 3 },
  '/materials/{id}': { name: 'Gula', active: true },
  '/sales': {
    items: [{ productId: '{{productId}}', quantity: 2 }],
    method: 'cash',
  },
  '/sales/{id}/confirm': {
    reason: 'Terverifikasi merchant',
    merchantRef: 'QRIS-CONTOH-1',
  },
  '/sales/backfill': {
    items: [{ productId: '{{productId}}', quantity: 2, unitPrice: 5000 }],
    occurredAt: WIB,
    occurredBy: '{{userId}}',
    manualRef: 'NOTA-MANUAL-1',
    reason: 'Lupa input kemarin',
    method: 'cash',
  },
  '/sales/{id}/correct': {
    items: [{ productId: '{{productId}}', quantity: 1, unitPrice: 5000 }],
    reason: 'Salah catat harga',
    method: 'qris',
    merchantRef: 'QRIS-KOREKSI-1',
    evidenceUnavailableReason: 'Bukti asli tidak tersedia',
  },
  '/sales/{id}/cancel': {
    reason: 'Pesanan dibatalkan',
    settlement: 'Dana diterima, pengembalian mengikuti',
  },
  '/sales/{id}/refund': {
    method: 'transfer',
    occurredAt: WIB,
    reason: 'Uang sudah dikembalikan',
  },
  '/purchases': {
    items: [
      {
        materialId: '{{materialId}}',
        name: 'Gula 1kg',
        quantity: 1000,
        cost: 15000,
      },
    ],
    occurredAt: WIB,
  },
  '/purchases/{id}/correct': {
    items: [
      {
        materialId: '{{materialId}}',
        name: 'Gula 1kg',
        quantity: 900,
        cost: 13500,
      },
    ],
    reason: 'Seharusnya 900 gram',
  },
  '/expenses': {
    category: 'Listrik',
    amount: 50000,
    note: 'Token bulanan',
    occurredAt: WIB,
  },
  '/expenses/{id}/correct': {
    category: 'Listrik',
    amount: 45000,
    note: 'Token bulanan',
    reason: 'Nominal benar 45000',
  },
  '/stock/usage': {
    materialId: '{{materialId}}',
    quantity: 250,
    reason: 'Pemakaian produksi harian',
  },
  '/stock/waste': {
    materialId: '{{materialId}}',
    quantity: 10,
    reason: 'Tumpah saat produksi',
  },
  '/stock/adjustment': {
    materialId: '{{materialId}}',
    delta: -2,
    reason: 'Selisih hitung fisik',
  },
  '/stock/ledger/{id}/correct': { delta: 2, reason: 'Koreksi mutasi kemarin' },
};
// body yang boleh kosong wajib tetap dikirim sesuai skema.
const empties = new Set(['/auth/logout', '/accounts/{id}/deactivate']);
// test script: simpan id hasil untuk request berikutnya.
const savers = {
  '/auth/login': "pm.environment.set('accessToken', pm.response.json().token);",
  '/accounts': "pm.environment.set('createdAccountId', pm.response.json().id);",
  '/products': "pm.environment.set('productId', pm.response.json().id);",
  '/materials': "pm.environment.set('materialId', pm.response.json().id);",
  '/sales': "pm.environment.set('saleId', pm.response.json().id);",
  '/sales/backfill':
    "pm.environment.set('backfillSaleId', pm.response.json().id);",
  '/purchases': "pm.environment.set('purchaseId', pm.response.json().id);",
  '/expenses': "pm.environment.set('expenseId', pm.response.json().id);",
};
const saveId = (p) =>
  savers[p] && {
    event: [
      {
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            'pm.test("HTTP 200", () => pm.response.to.have.status(200));',
            savers[p],
          ],
        },
      },
    ],
  };
const idempotent = (p) => p !== '/auth/login' && (empties.has(p) || bodies[p]);
const bearer = [{ key: 'Authorization', value: 'Bearer {{accessToken}}' }];

const request = (method, path, query = []) => {
  const [p] = path.split('/evidence');
  const name = `${method.toUpperCase()} ${p}`;
  const item = {
    name,
    request: {
      method,
      header: [
        ...bearer,
        ...(idempotent(path)
          ? [
              {
                key: 'Idempotency-Key',
                value: '{{idempotencyKey}}',
                description:
                  'Wajib 8-128. Ulangi nilai sama untuk retry identik; nilai beda dengan payload sama = 409.',
              },
            ]
          : []),
        ...(path.endsWith('/evidence') && method === 'POST'
          ? [{ key: 'Content-Type', value: 'image/png' }]
          : []),
      ],
      url: {
        raw: `{{baseUrl}}${p}${query.length ? `?${query.join('&')}` : ''}`,
        host: ['{{baseUrl}}'],
        path: p.split('/').filter(Boolean),
        query: query.map((q) => {
          const [k, v] = q.split('=');
          return { key: k, value: v };
        }),
      },
      ...(bodies[path] || empties.has(path)
        ? {
            body: {
              mode: 'raw',
              raw: JSON.stringify(bodies[path] ?? {}, null, 2),
              options: { raw: { language: 'json' } },
            },
          }
        : {}),
      ...(path.endsWith('/evidence') && method === 'POST'
        ? {
            body: { mode: 'file', file: { src: '/path/ke/foto.png' } },
            description:
              'Body biner JPEG/PNG/WebP maks 5MB. Pilih file foto pada tab Body.',
          }
        : {}),
      description:
        (spec.paths[path]?.[method]?.summary ?? '') ||
        (spec.paths[path]?.[method]?.description ?? ''),
    },
    ...saveId(path),
  };
  return item;
};

const folders = [
  [
    '0 Setup',
    [
      ['GET', '/'],
      ['GET', '/health'],
      ['POST', '/auth/login'],
      ['GET', '/auth/me'],
      ['POST', '/auth/logout'],
    ],
  ],
  [
    '1 Akun (admin)',
    [
      ['POST', '/accounts'],
      ['GET', '/accounts', ['page=1']],
      ['POST', '/accounts/{id}/reset-password'],
      ['POST', '/accounts/{id}/deactivate'],
    ],
  ],
  [
    '2 Katalog',
    [
      ['POST', '/products'],
      ['GET', '/products', ['page=1']],
      ['POST', '/products/{id}'],
      ['POST', '/materials'],
      ['GET', '/materials', ['page=1']],
      ['POST', '/materials/{id}'],
    ],
  ],
  [
    '3 Penjualan & QRIS',
    [
      ['POST', '/sales'],
      ['GET', '/sales', ['page=1']],
      ['GET', '/sales/{id}'],
      ['POST', '/sales/{id}/evidence'],
      ['GET', '/sales/{id}/evidence'],
      ['POST', '/sales/{id}/confirm'],
    ],
  ],
  [
    '4 Koreksi & Refund (admin)',
    [
      ['POST', '/sales/backfill'],
      ['POST', '/sales/{id}/correct'],
      ['POST', '/sales/{id}/cancel'],
      ['POST', '/sales/{id}/refund'],
    ],
  ],
  [
    '5 Stok & Pembelian (admin)',
    [
      ['POST', '/purchases'],
      ['GET', '/purchases', ['page=1']],
      ['POST', '/purchases/{id}/correct'],
      ['POST', '/stock/usage'],
      ['POST', '/stock/waste'],
      ['POST', '/stock/adjustment'],
      ['GET', '/stock', ['page=1']],
      ['GET', '/stock/balances'],
      ['POST', '/stock/ledger/{id}/correct'],
      ['POST', '/expenses'],
      ['GET', '/expenses', ['page=1']],
      ['POST', '/expenses/{id}/correct'],
    ],
  ],
  [
    '6 Laporan (admin)',
    [
      ['GET', '/reports/sales', ['from=2026-01-05&to=2026-01-06']],
      ['GET', '/reports/payments', ['from=2026-01-05&to=2026-01-06']],
      ['GET', '/reports/costs', ['from=2026-01-05&to=2026-01-06']],
    ],
  ],
];
const items = folders.map(([name, list]) => ({
  name,
  item: list.map(([m, p, q]) => request(m, p, q)),
}));

const collection = {
  info: {
    name: 'Esteh — integrasi lokal',
    _postman_id: '9d1f7a2e-esteh-lokal-0001-collection',
    schema:
      'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: [
      'Data uji, localhost/LAN tepercaya; bukan produksi.',
      'Urutan folder mengikuti alur: setup → akun → katalog → penjualan/QRIS → koreksi → stok/pembelian → laporan.',
      'Semua POST memakai Idempotency-Key dari variable idempotencyKey (per-send unik).',
      'Untuk uji retry identik: isi variable fixedIdempotencyKey (environment) lalu kirim request yang sama dua kali; response harus identik.',
      'Login otomatis menyimpan accessToken. Buat akun/produk lebih dulu karena request berikutnya memakai ID hasil test script.',
      'Upload bukti: pilih file foto pada tab Body (binary).',
    ].join('\n'),
  },
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:3000' }],
  auth: {
    type: 'bearer',
    bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }],
  },
  event: [
    {
      listen: 'prerequest',
      script: {
        type: 'text/javascript',
        exec: [
          "const fixed = pm.environment.get('fixedIdempotencyKey');",
          "pm.variables.set('idempotencyKey', fixed ? fixed : pm.variables.replaceIn('{{$guid}}'));",
        ],
      },
    },
  ],
  item: items,
};

// Cakupan: seluruh path non-docs pada spec wajib ada di collection.
const covered = new Set();
for (const [, list] of folders)
  for (const [m, p] of list) covered.add(`${m} ${p}`);
const missing = [];
for (const [p, methods] of Object.entries(spec.paths)) {
  if (p.startsWith('/docs')) continue;
  for (const m of Object.keys(methods))
    if (!covered.has(`${m.toUpperCase()} ${p}`))
      missing.push(`${m.toUpperCase()} ${p}`);
}
if (missing.length)
  throw new Error(`Collection belum mencakup: ${missing.join(', ')}`);

mkdirSync('postman', { recursive: true });
writeFileSync(
  'postman/esteh.postman_collection.json',
  JSON.stringify(collection, null, 2) + '\n',
);

// Environment publik (template) + environment lokal privat berisi kredensial uji.
const template = {
  name: 'esteh-local (template)',
  values: [
    { key: 'baseUrl', value: 'http://127.0.0.1:3000', enabled: true },
    { key: 'username', value: 'localadmin', enabled: true },
    {
      key: 'password',
      value: 'GANTI-DENGAN-PASSWORD-ANDA',
      type: 'secret',
      enabled: true,
    },
    { key: 'newUsername', value: 'karyawan01', enabled: true },
    { key: 'newPassword', value: 'ganti-password-karyawan-123', enabled: true },
    { key: 'fixedIdempotencyKey', value: '', enabled: true },
    { key: 'accessToken', value: '', type: 'secret', enabled: true },
    { key: 'userId', value: '', enabled: true },
    { key: 'productId', value: '', enabled: true },
    { key: 'materialId', value: '', enabled: true },
    { key: 'saleId', value: '', enabled: true },
    { key: 'backfillSaleId', value: '', enabled: true },
    { key: 'purchaseId', value: '', enabled: true },
    { key: 'expenseId', value: '', enabled: true },
    { key: 'createdAccountId', value: '', enabled: true },
  ],
};
writeFileSync(
  'postman/esteh-local.postman_environment.example.json',
  JSON.stringify(template, null, 2) + '\n',
);
mkdirSync('.tmp', { recursive: true });
const local = JSON.parse(JSON.stringify(template));
local.name = 'esteh-local';
const creds = JSON.parse(readFileSync('.tmp/local-access.json', 'utf8'));
for (const entry of local.values) {
  if (entry.key === 'password') entry.value = creds.password;
  if (entry.key === 'accessToken') entry.value = creds.token;
}
const localPath = '.tmp/esteh-local.postman_environment.json';
writeFileSync(localPath, JSON.stringify(local, null, 2) + '\n');
chmodSync(localPath, 0o600);
console.log(
  `postman/esteh.postman_collection.json (${collection.item.reduce((n, f) => n + f.item.length, 0)} request, cakupan penuh)`,
);
console.log(
  'postman/esteh-local.postman_environment.example.json (template publik)',
);
console.log(
  `${localPath} (privat, berisi kredensial/token localadmin; jangan dibagikan)`,
);
