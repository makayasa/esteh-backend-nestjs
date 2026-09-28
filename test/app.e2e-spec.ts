import { createServer, Server } from 'node:net';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureHttp } from '../src/http.js';

describe.each([false, true])('HTTP with SWAGGER_PUBLIC=%s', (publicDocs) => {
  let app: INestApplication<App>;
  let unavailableDb: Server;

  beforeEach(async () => {
    // Endpoint TCP lokal menutup koneksi: tidak bergantung pada DB/env host.
    unavailableDb = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) =>
      unavailableDb.listen(0, '127.0.0.1', resolve),
    );
    const address = unavailableDb.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing TCP port');
    vi.stubEnv('SESSION_SECRET', 'a'.repeat(64));
    vi.stubEnv('SWAGGER_PUBLIC', publicDocs ? 'true' : 'false');
    vi.stubEnv(
      'DATABASE_URL',
      `postgresql://test:test@127.0.0.1:${address.port}/test`,
    );
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureHttp(app);
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET) tanpa DB mengembalikan 503 not-ready', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', database: 'down' });
  });

  it('docs/page/assets follow opt-in; business API still requires token', async () => {
    for (const path of [
      '/docs/',
      '/docs/swagger-ui.css',
      '/docs/openapi.json',
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .expect(publicDocs ? 200 : 401);
    }
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer()).get('/sales').expect(401);
  });

  afterEach(async () => {
    await app.close();
    await new Promise<void>((resolve, reject) =>
      unavailableDb.close((error) => (error ? reject(error) : resolve())),
    );
    vi.unstubAllEnvs();
  });
});
