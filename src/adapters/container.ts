import { getServerEnv } from '@/config/env';
import { type Clock, systemClock } from './clock';
import { createDatabaseClient, type DatabaseClient } from './db/client';
import { createHealthRepository, type HealthRepository } from './db/health-repository';

/** Every concrete adapter, wired in one place (CLAUDE.md §4). */
export interface Container {
  readonly db: DatabaseClient;
  readonly clock: Clock;
  readonly healthRepository: HealthRepository;
}

function buildContainer(): Container {
  const env = getServerEnv();
  const db = createDatabaseClient(env.DATABASE_URL);
  return {
    db,
    clock: systemClock,
    healthRepository: createHealthRepository(db),
  };
}

// Kept on globalThis so Next.js dev hot reloads don't open a new connection pool each time.
const globalForContainer = globalThis as unknown as { container?: Container };

/** The application's adapters. Built lazily on first use. */
export function getContainer(): Container {
  globalForContainer.container ??= buildContainer();
  return globalForContainer.container;
}
