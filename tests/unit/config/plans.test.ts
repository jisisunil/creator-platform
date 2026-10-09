import { describe, expect, it } from 'vitest';
import { PLAN_DEFINITIONS } from '@/config/plans';

function plan(code: string) {
  const found = PLAN_DEFINITIONS.find((definition) => definition.code === code);
  if (!found) throw new Error(`missing plan ${code}`);
  return found;
}

describe('plan definitions (FR-11.1)', () => {
  it('defines every plan from the spec for India', () => {
    const codes = PLAN_DEFINITIONS.filter((p) => p.countryCode === 'IN').map((p) => p.code);

    expect(codes).toEqual(['FREE_BETA', 'TRIAL', 'PAY_AS_YOU_GO', 'STARTER', 'PRO', 'AGENCY']);
  });

  it('matches the spec prices (in paise), request limits and seats', () => {
    expect(plan('STARTER')).toMatchObject({
      priceMinor: 199_900,
      contactRequestsPerPeriod: 50,
      seatLimit: 1,
    });
    expect(plan('PRO')).toMatchObject({
      priceMinor: 499_900,
      contactRequestsPerPeriod: 200,
      seatLimit: 3,
    });
    expect(plan('AGENCY')).toMatchObject({
      priceMinor: 1_499_900,
      contactRequestsPerPeriod: 1000,
      seatLimit: 10,
    });
    expect(plan('TRIAL')).toMatchObject({
      priceMinor: 0,
      contactRequestsPerPeriod: 10,
      trialDays: 14,
    });
  });

  it('gates features by tier as the spec lists them', () => {
    expect(plan('STARTER')).toMatchObject({
      canSaveSearch: true,
      canCompare: true,
      canCsvExport: false,
    });
    expect(plan('PRO')).toMatchObject({ canCampaignReports: true, canCsvExport: true });
  });

  it('stores money as whole minor units', () => {
    for (const definition of PLAN_DEFINITIONS) {
      expect(Number.isInteger(definition.priceMinor)).toBe(true);
    }
  });
});
