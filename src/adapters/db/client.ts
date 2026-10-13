import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

export interface DatabasePoolOptions {
  /** Most connections this process opens. Sum over all instances must fit the server. */
  readonly maxConnections: number;
  /** Queries running longer are cancelled, so one slow query can't hold a connection. */
  readonly statementTimeoutMs: number;
  /** How long to wait for a free connection before failing the request. */
  readonly connectionTimeoutMs: number;
}

/** Safe defaults for tests and scripts; the app passes values from env (ADR-005). */
export const DEFAULT_POOL_OPTIONS: DatabasePoolOptions = {
  maxConnections: 5,
  statementTimeoutMs: 15_000,
  connectionTimeoutMs: 5_000,
};

const IDLE_CONNECTION_TIMEOUT_MS = 30_000;

/** Creates a Prisma client over a bounded pg connection pool. Callers own its lifecycle. */
export function createDatabaseClient(
  connectionString: string,
  options: DatabasePoolOptions = DEFAULT_POOL_OPTIONS,
): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    max: options.maxConnections,
    statement_timeout: options.statementTimeoutMs,
    connectionTimeoutMillis: options.connectionTimeoutMs,
    idleTimeoutMillis: IDLE_CONNECTION_TIMEOUT_MS,
    application_name: 'creator-platform',
  });
  return new PrismaClient({ adapter });
}

export type DatabaseClient = PrismaClient;
