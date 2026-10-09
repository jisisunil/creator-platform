import type { Clock } from '@/adapters/clock';
import type { HealthRepository } from '@/adapters/db/health-repository';

export interface HealthStatus {
  readonly isHealthy: boolean;
  readonly database: 'up' | 'down';
  readonly checkedAt: string;
}

export interface HealthDependencies {
  readonly healthRepository: HealthRepository;
  readonly clock: Clock;
}

/** Reports whether the app can serve requests; used by uptime checks (NFR-10). */
export async function checkHealth(deps: HealthDependencies): Promise<HealthStatus> {
  const isDatabaseUp = await deps.healthRepository.isDatabaseReachable();
  return {
    isHealthy: isDatabaseUp,
    database: isDatabaseUp ? 'up' : 'down',
    checkedAt: deps.clock.now().toISOString(),
  };
}
