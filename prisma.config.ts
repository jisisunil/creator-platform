import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts',
  },
  datasource: {
    // Migrations need a direct connection (not PgBouncer) for their advisory lock.
    url: process.env.DATABASE_DIRECT_URL || env('DATABASE_URL'),
  },
});
