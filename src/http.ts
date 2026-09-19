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
  const bodies = {
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
      reason: { ...string, minLength: 1, maxLength: 500 },
      merchantRef: { ...string, minLength: 1, maxLength: 128 },
    },
  };
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
            required: Object.keys(properties),
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
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: '/docs/openapi.json',
    yamlDocumentUrl: '/docs/openapi.yaml',
  });
}
