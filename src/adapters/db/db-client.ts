import type { Prisma, PrismaClient } from '@/generated/prisma/client';

/** Either the root client or a transaction client; repositories work with both. */
export type DbClient = PrismaClient | Prisma.TransactionClient;
