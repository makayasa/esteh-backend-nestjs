// Prisma 7: config CLI (migrate/generate) — url datasource tidak lagi di schema.
// Prisma CLI laadt .env niet meer automatisch; dotenv/config expliciet hier.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Generate tidak perlu DB; migrate deploy memvalidasi URL saat dijalankan.
    url: process.env.DATABASE_URL,
  },
});
