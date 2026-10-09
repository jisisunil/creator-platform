import { describe, expect, it } from 'vitest';
import { checkHealth } from '@/services/system';
import { fixedClock } from '../../fakes/fixed-clock';

const clock = fixedClock('2026-10-09T10:00:00.000Z');

describe('checkHealth (NFR-10)', () => {
  it('reports healthy when the database is reachable', async () => {
    const status = await checkHealth({
      healthRepository: { isDatabaseReachable: async () => true },
      clock,
    });

    expect(status).toEqual({
      isHealthy: true,
      database: 'up',
      checkedAt: '2026-10-09T10:00:00.000Z',
    });
  });

  it('reports unhealthy when the database is down', async () => {
    const status = await checkHealth({
      healthRepository: { isDatabaseReachable: async () => false },
      clock,
    });

    expect(status.isHealthy).toBe(false);
    expect(status.database).toBe('down');
  });
});
