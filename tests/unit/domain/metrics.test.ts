import { describe, expect, it } from 'vitest';
import { acceptanceRatePercent } from '@/domain/metrics';

describe('acceptanceRatePercent (success metrics)', () => {
  it('is the accepted share of requests with an outcome', () => {
    expect(acceptanceRatePercent({ accepted: 2, declined: 1, expired: 2 })).toBe(40);
  });

  it('rounds to a whole percentage', () => {
    expect(acceptanceRatePercent({ accepted: 1, declined: 2, expired: 0 })).toBe(33);
  });

  it('is null before any request has an outcome', () => {
    expect(acceptanceRatePercent({ accepted: 0, declined: 0, expired: 0 })).toBeNull();
  });
});
