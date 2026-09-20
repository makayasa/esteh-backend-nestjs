import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  INestApplication,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, raw } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { IdentityService } from './identity/identity.service.js';

@Catch()
class SafeErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : error instanceof SyntaxError
          ? 400
          : typeof error === 'object' &&
              error !== null &&
              'type' in error &&
              error.type === 'entity.too.large'
            ? 413
            : 500;
    const body =
      error instanceof HttpException
        ? error.getResponse()
        : status === 413
          ? 'Payload too large'
          : status === 400
            ? 'Invalid JSON'
            : 'Internal server error';
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json(
        typeof body === 'object' ? body : { statusCode: status, message: body },
      );
  }
}

export function configureHttp(app: INestApplication) {
  app.use(json({ limit: '16kb' }));
  // P5/Q27: bukti QRIS berupa body biner image/*, maks 5 MB (413 bila lebih).
  app.use(
    raw({
      type: ['image/jpeg', 'image/png', 'image/webp'],
      limit: 5 * 1024 * 1024,
    }),
  );
  app.useGlobalFilters(new SafeErrors());
  const identity = app.get(IdentityService);
  app.use('/docs', (req: Request, res: Response, next: NextFunction) => {
    void identity
      .me(req.headers.authorization)
      .then((account) => {
        if (account.role !== 'admin') {
          res.status(403).json({ message: 'Forbidden' });
          return;
        }
        next();
      })
      .catch(() => res.status(401).json({ message: 'Unauthorized' }));
  });
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Esteh — integrasi lokal')
      .setVersion('1')
      .setDescription(
        'Localhost/LAN tepercaya, data uji. Bearer session: idle 12 jam/absolut 7 hari. JSON maksimum16KiB; image5MiB/20MP. Semua POST memerlukan Idempotency-Key 8..128, scope pelaku+operasi; retry identik satu efek, payload beda409, izin terkini diperiksa sebelum replay. Tanggal ISO8601 berzona waktu; laporan from/to YYYY-MM-DD inklusif Asia/Jakarta. Nominal integer rupiah, bukan laba. Lihat docs/api.md untuk contoh alur.',
      )
      .addBearerAuth()
      .build(),
  );
  const string = { type: 'string' as const };
  const boolean = { type: 'boolean' as const };
  const password = {
    ...string,
    minLength: 12,
    maxLength: 128,
    writeOnly: true,
  };
  const name = { ...string, minLength: 1, maxLength: 120 };
  const product = {
    name,
    price: { type: 'integer' as const, minimum: 1, maximum: 1000000000 },
    available: boolean,
  };
  const occurredAt = {
    ...string,
    format: 'date-time',
    example: '2026-01-05T08:00:00+07:00',
  };
  const reason = { ...string, minLength: 1, maxLength: 280 };
  const purchaseItems = {
    type: 'array',
    minItems: 1,
    maxItems: 100,
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'quantity', 'cost'],
      properties: {
        materialId: { ...string, nullable: true },
        name,
        quantity: { type: 'number', minimum: 0.001, maximum: 1000000000 },
        cost: { type: 'integer', minimum: 1, maximum: 1000000000 },
      },
    },
  };
  const stock = {
    materialId: string,
    quantity: { type: 'number', minimum: 0.001 },
    reason,
    occurredAt,
  };
  const expense = {
    category: { ...string, minLength: 1, maxLength: 64 },
    amount: { type: 'integer', minimum: 1, maximum: 1000000000 },
    note: { ...string, maxLength: 280 },
  };
  const bodies = {
    '/purchases': { items: purchaseItems, occurredAt },
    '/purchases/{id}/correct': { items: purchaseItems, reason },
    '/expenses': { ...expense, occurredAt },
    '/expenses/{id}/correct': { ...expense, reason },
    '/stock/usage': stock,
    '/stock/waste': stock,
    '/stock/adjustment': {
      materialId: string,
      delta: { type: 'number' },
      reason,
      occurredAt,
    },
    '/stock/ledger/{id}/correct': { delta: { type: 'number' }, reason },
    '/auth/logout': {},
    '/accounts': {
      username: {
        ...string,
        minLength: 3,
        maxLength: 64,
        pattern: '^[a-z0-9._-]+$',
      },
      password,
      role: { ...string, enum: ['admin', 'employee'] },
    },
    '/accounts/{id}/reset-password': { password },
    '/accounts/{id}/deactivate': {},
    '/products': product,
    '/products/{id}': { ...product, active: boolean },
    '/materials': {
      name,
      unit: { ...string, maxLength: 24, pattern: '^[a-z][a-z0-9_-]*$' },
      quantityScale: { type: 'integer' as const, minimum: 0, maximum: 3 },
    },
    '/materials/{id}': { name, active: boolean },
    '/sales': {
      items: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['productId', 'quantity'],
          properties: {
            productId: { ...string, minLength: 1, maxLength: 64 },
            quantity: { type: 'integer', minimum: 1, maximum: 10000 },
          },
        },
      },
      method: { ...string, enum: ['cash', 'qris'] },
    },
    '/sales/{id}/confirm': {
      receivedAt: occurredAt,
      reason: { ...string, minLength: 1, maxLength: 500 },
      merchantRef: { ...string, minLength: 1, maxLength: 128 },
    },
    '/sales/backfill': {
      items: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['productId', 'quantity', 'unitPrice'],
          properties: {
            productId: { ...string, minLength: 1, maxLength: 64 },
            quantity: { type: 'integer', minimum: 1, maximum: 10000 },
            unitPrice: { type: 'integer', minimum: 1, maximum: 1000000000 },
          },
        },
      },
      occurredAt: { ...string, minLength: 20, maxLength: 64 },
      occurredBy: string,
      manualRef: { ...string, minLength: 1, maxLength: 128 },
      reason: { ...string, minLength: 1, maxLength: 500 },
      method: { ...string, enum: ['cash', 'qris'] },
    },
    '/sales/{id}/correct': {
      evidenceUnavailableReason: { ...string, minLength: 1, maxLength: 500 },
      items: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['productId', 'quantity', 'unitPrice'],
          properties: {
            productId: { ...string, minLength: 1, maxLength: 64 },
            quantity: { type: 'integer', minimum: 1, maximum: 10000 },
            unitPrice: { type: 'integer', minimum: 1, maximum: 1000000000 },
          },
        },
      },
      reason: { ...string, minLength: 1, maxLength: 500 },
      method: { ...string, enum: ['cash', 'qris'] },
      merchantRef: { ...string, minLength: 1, maxLength: 128 },
    },
    '/sales/{id}/cancel': {
      settlement: {
        ...string,
        minLength: 1,
        maxLength: 500,
        description:
          'Wajib bila sudah lunas: penjelasan penyelesaian uang, bukan refund otomatis.',
      },
      reason: { ...string, minLength: 1, maxLength: 500 },
    },
    '/sales/{id}/refund': {
      method: { ...string, minLength: 1, maxLength: 32 },
      occurredAt: { ...string, minLength: 20, maxLength: 64 },
      reason: { ...string, minLength: 1, maxLength: 500 },
    },
  };
  const required: Record<string, string[]> = {
    '/sales': ['items'],
    '/sales/{id}/confirm': [],
    '/sales/backfill': [
      'items',
      'occurredAt',
      'occurredBy',
      'manualRef',
      'reason',
    ],
    '/sales/{id}/correct': ['items', 'reason'],
    '/sales/{id}/cancel': ['reason'],
    '/sales/{id}/refund': ['method', 'reason'],
    '/purchases': ['items'],
    '/expenses': ['category', 'amount'],
    '/expenses/{id}/correct': ['category', 'amount', 'reason'],
    '/stock/usage': ['materialId', 'quantity', 'reason'],
    '/stock/waste': ['materialId', 'quantity', 'reason'],
    '/stock/adjustment': ['materialId', 'delta', 'reason'],
  };
  // Backfill may use historical override; correction requires explicit prices.
  bodies['/sales/backfill'].items.items.required = ['productId', 'quantity'];
  for (const [path, properties] of Object.entries(bodies)) {
    const operation = document.paths[path]?.post;
    if (!operation) throw new Error(`Missing OpenAPI route: ${path}`);
    operation.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            additionalProperties: false,
            required: required[path] ?? Object.keys(properties),
            properties,
          },
        },
      },
    };
    operation.parameters = [
      ...(operation.parameters ?? []),
      {
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        schema: { type: 'string', minLength: 8, maxLength: 128 },
      },
    ];
    operation.responses = {
      '200': { description: 'Success or identical authorized replay' },
      '400': { description: 'Invalid payload' },
      '401': { description: 'Invalid/expired/revoked session' },
      '403': { description: 'Role required' },
      '409': {
        description: 'Idempotency payload conflict or duplicate username',
      },
    };
  }
  const upload = document.paths['/sales/{id}/evidence'].post!;
  upload.requestBody = {
    required: true,
    content: Object.fromEntries(
      ['image/jpeg', 'image/png', 'image/webp'].map((mime) => [
        mime,
        { schema: { type: 'string', format: 'binary' } },
      ]),
    ),
  };
  upload.parameters = [
    ...(upload.parameters ?? []),
    {
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', minLength: 8, maxLength: 128 },
    },
  ];
  upload.description =
    'Upload setelah membuat QRIS pending. Maksimum5MiB/20MP, still image; metadata dibuang. Upload bukan konfirmasi merchant. Download privat melalui GET route sama.';
  for (const [path, entry] of Object.entries(document.paths)) {
    for (const method of ['get', 'post'] as const) {
      const operation = entry[method];
      if (!operation) continue;
      operation.responses ??= {};
      for (const [status, message] of Object.entries({
        '400': 'Payload invalid',
        '401': 'Unauthorized',
        '403': 'Forbidden',
        '404': 'Not Found',
        '409': 'Conflict',
        '413': 'Payload too large',
        '429': 'Terlalu banyak percobaan login',
        '500': 'Internal server error',
      })) {
        operation.responses[status] = {
          description: message,
          content: {
            'application/json': {
              example: { statusCode: Number(status), message },
            },
          },
        };
      }
      if (
        method === 'get' &&
        [
          '/accounts',
          '/products',
          '/materials',
          '/sales',
          '/purchases',
          '/expenses',
          '/stock',
        ].includes(path)
      ) {
        operation.parameters = [
          ...(operation.parameters ?? []).filter(
            (p) => !('name' in p && p.name === 'page'),
          ),
          {
            name: 'page',
            in: 'query',
            required: false,
            schema: {
              type: 'integer',
              minimum: 1,
              maximum: 999999,
              default: 1,
            },
            description: '50 item per halaman, urutan ID stabil',
          },
        ];
      }
    }
  }
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: '/docs/openapi.json',
    yamlDocumentUrl: '/docs/openapi.yaml',
  });
}
