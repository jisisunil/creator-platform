import { describe, expect, it } from 'vitest';
import { needsPrivacyReconsent, type NoticeVersion } from '@/domain/consent';

const v1: NoticeVersion = {
  version: 'v1',
  publishedAt: new Date('2026-10-01'),
  isMaterialChange: false,
};
const v2Minor: NoticeVersion = {
  version: 'v2',
  publishedAt: new Date('2026-11-01'),
  isMaterialChange: false,
};
const v3Material: NoticeVersion = {
  version: 'v3',
  publishedAt: new Date('2026-12-01'),
  isMaterialChange: true,
};

describe('needsPrivacyReconsent (PRV-8)', () => {
  it('needs nothing when the accepted notice is current', () => {
    expect(needsPrivacyReconsent('v1', [v1])).toBe(false);
  });

  it('PRV-8 ignores later notices without a material change', () => {
    expect(needsPrivacyReconsent('v1', [v1, v2Minor])).toBe(false);
  });

  it('PRV-8 asks again after a material change', () => {
    expect(needsPrivacyReconsent('v1', [v1, v2Minor, v3Material])).toBe(true);
    expect(needsPrivacyReconsent('v3', [v1, v2Minor, v3Material])).toBe(false);
  });

  it('PRV-1 always needs consent when none was recorded', () => {
    expect(needsPrivacyReconsent(null, [v1])).toBe(true);
    expect(needsPrivacyReconsent('unknown', [v1])).toBe(true);
  });
});
