import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

/** Creates a Prisma client over the pg driver adapter. Callers own its lifecycle. */
export function createDatabaseClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export type DatabaseClient = PrismaClient;
