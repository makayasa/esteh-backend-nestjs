import { createServer, Server } from 'node:net';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
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
    vi.stubEnv(
      'DATABASE_URL',
      `postgresql://test:test@127.0.0.1:${address.port}/test`,
    );
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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

  afterEach(async () => {
    await app.close();
    await new Promise<void>((resolve, reject) =>
      unavailableDb.close((error) => (error ? reject(error) : resolve())),
    );
    vi.unstubAllEnvs();
  });
});
