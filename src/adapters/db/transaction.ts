import type { PrismaClient } from '@/generated/prisma/client';
import { createRepositories, type Repositories } from './repositories';

/** Runs `work` in one database transaction with repositories bound to it (CLAUDE.md §4). */
export type TransactionRunner = <T>(work: (repos: Repositories) => Promise<T>) => Promise<T>;

export function createTransactionRunner(db: PrismaClient): TransactionRunner {
  return (work) => db.$transaction((tx) => work(createRepositories(tx)));
}
