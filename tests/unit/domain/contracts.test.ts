import { describe, expect, it } from 'vitest';
import { canonicalContractContent, contractStateOf, type ContractTerms } from '@/domain/contracts';

const TERMS: ContractTerms = {
  brandName: 'Demo Brand',
  creatorName: 'Demo Creator',
  campaignName: 'Diwali',
  brief: 'Two reels.',
  deliverables: [{ deliverable: 'REEL', quantity: 2 }],
  usageRights: 'BRAND_ORGANIC',
  amountMinor: 3_000_000,
  currencyCode: 'INR',
  advancePercent: 30,
  paymentDueOn: null,
  deadline: '2026-12-01',
  reviewDays: 7,
  maxChangeRequests: 2,
};

describe('contracts (ADR-012)', () => {
  it('describes where the current version stands', () => {
    expect(contractStateOf(false, [])).toBe('NONE');
    expect(contractStateOf(true, [])).toBe('AWAITING_BRAND');
    expect(contractStateOf(true, ['BRAND'])).toBe('AWAITING_CREATOR');
    expect(contractStateOf(true, ['CREATOR', 'BRAND'])).toBe('SIGNED');
  });

  it('gives the same content the same canonical form whatever the key order', () => {
    const content = { templateVersion: 1, terms: TERMS, additionalTerms: null, fileSha256: null };
    const reordered = {
      fileSha256: null,
      additionalTerms: null,
      terms: Object.fromEntries(Object.entries(TERMS).reverse()) as unknown as ContractTerms,
      templateVersion: 1,
    };

    expect(canonicalContractContent(reordered)).toBe(canonicalContractContent(content));
  });

  it('changes the canonical form when any term changes', () => {
    const content = { templateVersion: 1, terms: TERMS, additionalTerms: null, fileSha256: null };

    expect(
      canonicalContractContent({ ...content, terms: { ...TERMS, amountMinor: 3_000_001 } }),
    ).not.toBe(canonicalContractContent(content));
    expect(canonicalContractContent({ ...content, additionalTerms: 'Exclusive' })).not.toBe(
      canonicalContractContent(content),
    );
    expect(canonicalContractContent({ ...content, templateVersion: 2 })).not.toBe(
      canonicalContractContent(content),
    );
  });
});
