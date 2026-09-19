import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export function createDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib diisi');
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 2000,
      max: 10,
    }),
  });
}

@Injectable()
export class Database implements OnModuleDestroy {
  readonly client = createDatabase();
  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
