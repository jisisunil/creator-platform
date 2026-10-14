import type { CreatorTier } from '@/config/score';

export type SearchSort = 'score' | 'engagement' | 'followers' | 'growth';
export type SearchPlatform = 'YOUTUBE' | 'INSTAGRAM';

/** FR-5.1 filters. Absent fields mean "any". Engagement is a percentage (e.g. 2.5). */
export interface SearchFilters {
  readonly query?: string;
  readonly platforms?: readonly SearchPlatform[];
  readonly categories?: readonly string[];
  readonly countryCode?: string;
  readonly stateCode?: string;
  readonly city?: string;
  readonly languages?: readonly string[];
  readonly tiers?: readonly CreatorTier[];
  readonly minFollowers?: number;
  readonly maxFollowers?: number;
  readonly minEngagementPercent?: number;
  readonly minScore?: number;
  readonly isVerifiedOnly?: boolean;
  readonly isOpenOnly?: boolean;
  readonly audienceGender?: 'F' | 'M';
  readonly audienceAge?: string;
}

/** Which widening a suggestion makes, for the "try instead" message (FR-5.3). */
export type WideningKind =
  | 'cityToState'
  | 'stateToCountry'
  | 'dropQuery'
  | 'dropMinScore'
  | 'dropMinEngagement'
  | 'dropFollowerRange'
  | 'dropVerifiedOnly'
  | 'dropAudience'
  | 'dropLanguages'
  | 'dropTiers';

export interface Widening {
  readonly kind: WideningKind;
  readonly filters: SearchFilters;
}

/**
 * FR-5.3 / UC-D1: ways to widen a search that found nothing, most specific first: "widen
 * city to state", then state to country, then drop one strict filter at a time. The caller
 * keeps only those that actually return results.
 */
export function wideningsFor(filters: SearchFilters): Widening[] {
  const widenings: Widening[] = [];
  const without = <K extends keyof SearchFilters>(...keys: K[]): SearchFilters => {
    const copy: Record<string, unknown> = { ...filters };
    for (const key of keys) delete copy[key];
    return copy as SearchFilters;
  };

  if (filters.city) widenings.push({ kind: 'cityToState', filters: without('city') });
  else if (filters.stateCode)
    widenings.push({ kind: 'stateToCountry', filters: without('stateCode') });
  if (filters.query) widenings.push({ kind: 'dropQuery', filters: without('query') });
  if (filters.minScore !== undefined)
    widenings.push({ kind: 'dropMinScore', filters: without('minScore') });
  if (filters.minEngagementPercent !== undefined) {
    widenings.push({ kind: 'dropMinEngagement', filters: without('minEngagementPercent') });
  }
  if (filters.minFollowers !== undefined || filters.maxFollowers !== undefined) {
    widenings.push({ kind: 'dropFollowerRange', filters: without('minFollowers', 'maxFollowers') });
  }
  if (filters.isVerifiedOnly)
    widenings.push({ kind: 'dropVerifiedOnly', filters: without('isVerifiedOnly') });
  if (filters.audienceGender || filters.audienceAge) {
    widenings.push({ kind: 'dropAudience', filters: without('audienceGender', 'audienceAge') });
  }
  if (filters.languages?.length)
    widenings.push({ kind: 'dropLanguages', filters: without('languages') });
  if (filters.tiers?.length) widenings.push({ kind: 'dropTiers', filters: without('tiers') });
  return widenings;
}

/** UC-D5: keeps only filter values that still exist; reports whether anything was dropped. */
export function pruneUnknownFilterValues(
  filters: SearchFilters,
  known: {
    readonly categories: ReadonlySet<string>;
    readonly languages: ReadonlySet<string>;
    readonly stateCodes: ReadonlySet<string>;
  },
): { filters: SearchFilters; hasDroppedValues: boolean } {
  const categories = filters.categories?.filter((slug) => known.categories.has(slug));
  const languages = filters.languages?.filter((code) => known.languages.has(code));
  const isStateKnown = !filters.stateCode || known.stateCodes.has(filters.stateCode);
  const hasDroppedValues =
    (categories?.length ?? 0) !== (filters.categories?.length ?? 0) ||
    (languages?.length ?? 0) !== (filters.languages?.length ?? 0) ||
    !isStateKnown;
  const pruned: Record<string, unknown> = { ...filters, categories, languages };
  if (!isStateKnown) {
    delete pruned.stateCode;
    delete pruned.city;
  }
  return { filters: pruned as SearchFilters, hasDroppedValues };
}
