import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class HealthService implements OnModuleDestroy {
  private client: PrismaClient | undefined;

  // Lazy: tidak dibangun sebelum check pertama, sehingga /health tetap 503
  // ketika DATABASE_URL hilang atau DB tidak konekted.
  private getClient(): PrismaClient {
    if (!this.client) {
      this.client = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: process.env.DATABASE_URL ?? '',
          connectionTimeoutMillis: 2000,
          query_timeout: 2000,
        }),
      });
    }
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.$disconnect();
  }

  async check(): Promise<{ status: string; database: string }> {
    try {
      await this.getClient().$queryRawUnsafe('SELECT 1');
      return { status: 'ok', database: 'up' };
    } catch {
      return { status: 'degraded', database: 'down' };
    }
  }
}
