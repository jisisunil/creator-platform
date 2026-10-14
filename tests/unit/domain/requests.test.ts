import { describe, expect, it } from 'vitest';
import {
  contactPeriodStart,
  effectiveRequestStatus,
  isRequestExpired,
  openPairKey,
  requestExpiresAt,
} from '@/domain/requests';
import { deliverableLinesFrom, requestFieldsSchema } from '@/lib/validation/request-schemas';

const at = (iso: string) => new Date(iso);

describe('request expiry (FR-7.2)', () => {
  it('expires 14 days after sending', () => {
    const expiresAt = requestExpiresAt(at('2026-10-01T09:30:00Z'), 14);

    expect(expiresAt.toISOString()).toBe('2026-10-15T09:30:00.000Z');
  });

  it('is expired exactly at the expiry time, not before', () => {
    const request = { expiresAt: at('2026-10-15T09:30:00Z') };

    expect(isRequestExpired(request, at('2026-10-15T09:29:59Z'))).toBe(false);
    expect(isRequestExpired(request, at('2026-10-15T09:30:00Z'))).toBe(true);
  });

  it('shows an open request past its expiry as expired before the job runs', () => {
    const request = { status: 'OPEN' as const, expiresAt: at('2026-10-15T00:00:00Z') };

    expect(effectiveRequestStatus(request, at('2026-10-16T00:00:00Z'))).toBe('EXPIRED');
    expect(effectiveRequestStatus(request, at('2026-10-14T00:00:00Z'))).toBe('OPEN');
    expect(
      effectiveRequestStatus({ ...request, status: 'ACCEPTED' }, at('2026-10-16T00:00:00Z')),
    ).toBe('ACCEPTED');
  });

  it('builds one open-pair key per brand and creator', () => {
    expect(openPairKey('brand1', 'creator1')).toBe('brand1:creator1');
  });
});

describe('contactPeriodStart (FR-7.3, FR-11.1)', () => {
  it('counts everything since the plan started when the plan has no period (trial)', () => {
    const started = at('2026-09-20T08:00:00Z');

    expect(contactPeriodStart('NONE', started, at('2026-12-01T00:00:00Z'))).toEqual(started);
  });

  it('renews monthly on the day the plan started', () => {
    const started = at('2026-01-15T08:00:00Z');

    expect(contactPeriodStart('MONTHLY', started, at('2026-10-20T00:00:00Z')).toISOString()).toBe(
      '2026-10-15T08:00:00.000Z',
    );
    expect(contactPeriodStart('MONTHLY', started, at('2026-10-10T00:00:00Z')).toISOString()).toBe(
      '2026-09-15T08:00:00.000Z',
    );
  });

  it('uses the last day of shorter months for plans started on the 31st', () => {
    const started = at('2026-01-31T00:00:00Z');

    expect(contactPeriodStart('MONTHLY', started, at('2026-03-05T00:00:00Z')).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });

  it('starts the first period on the plan start itself', () => {
    const started = at('2026-10-09T10:00:00Z');

    expect(contactPeriodStart('MONTHLY', started, started)).toEqual(started);
  });
});

describe('request form fields (FR-7.1)', () => {
  const valid = {
    campaignName: 'Diwali',
    brief: 'Two reels about our festive sweets, warm family tone.',
    REEL: '2',
    STORY: '',
    VIDEO: '',
    POST: '1',
    budgetRupees: '25000',
    deadline: '2026-11-01',
    usageRights: 'BRAND_ORGANIC',
  };

  it('keeps only the deliverables with a quantity, in a fixed order', () => {
    const fields = requestFieldsSchema.parse(valid);

    expect(deliverableLinesFrom(fields)).toEqual([
      { deliverable: 'REEL', quantity: 2 },
      { deliverable: 'POST', quantity: 1 },
    ]);
    expect(fields.budgetRupees).toBe(25_000);
  });

  it('needs at least one deliverable', () => {
    const result = requestFieldsSchema.safeParse({ ...valid, REEL: '', POST: '0' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('request.noDeliverables');
  });

  it('treats a blank budget as "not stated" and rejects zero', () => {
    expect(requestFieldsSchema.parse({ ...valid, budgetRupees: '' }).budgetRupees).toBeNull();
    expect(requestFieldsSchema.safeParse({ ...valid, budgetRupees: '0' }).success).toBe(false);
  });
});
