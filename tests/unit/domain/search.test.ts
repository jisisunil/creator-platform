import { describe, expect, it } from 'vitest';
import { toCsv } from '@/domain/csv';
import { pruneUnknownFilterValues, wideningsFor } from '@/domain/search';
import {
  paramsFromQuery,
  parseSavedFilters,
  parseSearchParams,
  toSearchQuery,
} from '@/lib/validation/search-schemas';

describe('wideningsFor (FR-5.3, UC-D1)', () => {
  it('widens city to state first, then drops strict filters one at a time', () => {
    const kinds = wideningsFor({
      stateCode: 'TN',
      city: 'Madurai',
      minScore: 80,
      isVerifiedOnly: true,
      languages: ['ta'],
    }).map((widening) => widening.kind);

    expect(kinds).toEqual(['cityToState', 'dropMinScore', 'dropVerifiedOnly', 'dropLanguages']);
  });

  it('widens state to the whole country when no city is set', () => {
    const [first] = wideningsFor({ stateCode: 'TN' });

    expect(first).toEqual({ kind: 'stateToCountry', filters: {} });
  });

  it('keeps every other filter when widening', () => {
    const [cityToState] = wideningsFor({ stateCode: 'TN', city: 'Madurai', categories: ['food'] });

    expect(cityToState?.filters).toEqual({ stateCode: 'TN', categories: ['food'] });
  });
});

describe('pruneUnknownFilterValues (UC-D5)', () => {
  const known = {
    categories: new Set(['food', 'travel']),
    languages: new Set(['ta', 'hi']),
    stateCodes: new Set(['TN']),
  };

  it('drops values that no longer exist and says so', () => {
    const result = pruneUnknownFilterValues(
      { categories: ['food', 'retired-category'], languages: ['ta'] },
      known,
    );

    expect(result).toEqual({
      filters: { categories: ['food'], languages: ['ta'] },
      hasDroppedValues: true,
    });
  });

  it('drops an unknown state together with its city', () => {
    const result = pruneUnknownFilterValues({ stateCode: 'XX', city: 'Somewhere' }, known);

    expect(result.filters.stateCode).toBeUndefined();
    expect(result.filters.city).toBeUndefined();
    expect(result.hasDroppedValues).toBe(true);
  });

  it('reports nothing dropped when every value is still valid', () => {
    expect(pruneUnknownFilterValues({ categories: ['food'] }, known).hasDroppedValues).toBe(false);
  });
});

describe('search URL parameters (FR-5.1)', () => {
  it('round-trips filters, sort and page through the URL', () => {
    const filters = {
      query: 'recipes',
      platforms: ['YOUTUBE' as const],
      categories: ['food', 'travel'],
      stateCode: 'TN',
      minFollowers: 10_000,
      minEngagementPercent: 2.5,
      isVerifiedOnly: true,
      audienceGender: 'F' as const,
    };

    const parsed = parseSearchParams(paramsFromQuery(toSearchQuery(filters, 'growth', 3)));

    expect(parsed).toEqual({ filters, sort: 'growth', page: 3 });
  });

  it('drops tampered values instead of failing', () => {
    const parsed = parseSearchParams({
      tier: ['MICRO', 'GIANT'],
      minScore: 'lots',
      sort: 'random',
      page: '-4',
      state: 'tamil nadu',
      platform: 'TIKTOK',
    });

    expect(parsed).toEqual({ filters: { tiers: ['MICRO'] }, sort: 'score', page: 1 });
  });

  it('ignores empty form fields', () => {
    expect(parseSearchParams({ q: '', city: '', minFollowers: '' }).filters).toEqual({});
  });

  it('validates saved filters the same way', () => {
    expect(parseSavedFilters({ categories: ['food'], minScore: 999 })).toEqual({
      categories: ['food'],
    });
    expect(parseSavedFilters('not an object')).toEqual({});
  });
});

describe('toCsv (FR-6.3)', () => {
  it('quotes commas, quotes and new lines', () => {
    expect(toCsv(['a', 'b'], [['x, y', 'say "hi"\nthere']])).toBe(
      'a,b\r\n"x, y","say ""hi""\nthere"',
    );
  });

  it('neutralises cells that a spreadsheet would run as formulas', () => {
    expect(toCsv(['name'], [['=HYPERLINK("http://evil")'], ['@SUM(A1)'], ['-2+3']])).toBe(
      `name\r\n"'=HYPERLINK(""http://evil"")"\r\n'@SUM(A1)\r\n'-2+3`,
    );
  });

  it('leaves numbers alone, including negatives', () => {
    expect(toCsv(['n'], [[-5], [42], [null]])).toBe('n\r\n-5\r\n42\r\n');
  });
});
