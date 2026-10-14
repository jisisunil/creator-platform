import { z } from 'zod';
import { AUDIENCE_AGE_BUCKETS, SAVED_SEARCH_NAME_MAX, SEARCH_MAX_PAGE } from '@/config/search';
import { TIER_LOWER_BOUNDS } from '@/config/score';
import type { SearchFilters, SearchSort } from '@/domain/search';

/**
 * FR-5.1 search filters in the URL, so searches can be bookmarked, shared within a team and
 * saved. Parsing is lenient: a tampered or stale value is dropped, never an error page.
 */

const MAX_QUERY_LENGTH = 100;
const MAX_FOLLOWERS = 1_000_000_000;
const TIERS = Object.keys(TIER_LOWER_BOUNDS) as (keyof typeof TIER_LOWER_BOUNDS)[];
const SORTS = [
  'score',
  'engagement',
  'followers',
  'growth',
] as const satisfies readonly SearchSort[];

const asList = (value: unknown): unknown[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/** A list of allowed values; anything else in the list is silently dropped. */
const listOf = <T extends string>(allowed: z.ZodType<T>) =>
  z.preprocess(
    (value) => asList(value).filter((item) => allowed.safeParse(item).success),
    z.array(allowed),
  );

const slugList = listOf(z.string().regex(/^[a-z0-9-]{1,40}$/));
const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);
const flag = z.preprocess(
  (value) => value === '1' || value === 'true' || value === true,
  z.boolean(),
);
const blankToUndefined = (value: unknown) => (value === '' ? undefined : value);

export const searchParamsSchema = z.object({
  q: optional(z.string().trim().min(1).max(MAX_QUERY_LENGTH)),
  platform: listOf(z.enum(['YOUTUBE', 'INSTAGRAM'])),
  category: slugList,
  language: listOf(z.string().regex(/^[a-z]{2,3}$/)),
  tier: listOf(z.enum(TIERS)),
  state: optional(z.preprocess(blankToUndefined, z.string().regex(/^[A-Z]{2}$/))),
  city: optional(z.preprocess(blankToUndefined, z.string().trim().min(1).max(80))),
  minFollowers: optional(
    z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(MAX_FOLLOWERS)),
  ),
  maxFollowers: optional(
    z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(MAX_FOLLOWERS)),
  ),
  minEngagement: optional(z.preprocess(blankToUndefined, z.coerce.number().min(0).max(100))),
  minScore: optional(z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(100))),
  verified: flag,
  open: flag,
  gender: optional(z.preprocess(blankToUndefined, z.enum(['F', 'M']))),
  age: optional(z.preprocess(blankToUndefined, z.enum(AUDIENCE_AGE_BUCKETS))),
  sort: z.enum(SORTS).catch('score'),
  page: z.coerce.number().int().min(1).max(SEARCH_MAX_PAGE).catch(1),
});

export interface ParsedSearch {
  readonly filters: SearchFilters;
  readonly sort: SearchSort;
  readonly page: number;
}

/** Search filters, sort and page from URL search params. */
export function parseSearchParams(
  params: Record<string, string | string[] | undefined>,
): ParsedSearch {
  const parsed = searchParamsSchema.parse(params);
  const filters: SearchFilters = {
    query: parsed.q,
    platforms: parsed.platform.length ? parsed.platform : undefined,
    categories: parsed.category.length ? parsed.category : undefined,
    languages: parsed.language.length ? parsed.language : undefined,
    tiers: parsed.tier.length ? parsed.tier : undefined,
    stateCode: parsed.state,
    city: parsed.city,
    minFollowers: parsed.minFollowers,
    maxFollowers: parsed.maxFollowers,
    minEngagementPercent: parsed.minEngagement,
    minScore: parsed.minScore,
    isVerifiedOnly: parsed.verified || undefined,
    isOpenOnly: parsed.open || undefined,
    audienceGender: parsed.gender,
    audienceAge: parsed.age,
  };
  return {
    filters: Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined),
    ) as SearchFilters,
    sort: parsed.sort,
    page: parsed.page,
  };
}

/** The URL query for filters, sort and page; the inverse of parseSearchParams. */
export function toSearchQuery(
  filters: SearchFilters,
  sort: SearchSort = 'score',
  page = 1,
): string {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '') params.append(key, String(value));
  };
  set('q', filters.query);
  filters.platforms?.forEach((value) => set('platform', value));
  filters.categories?.forEach((value) => set('category', value));
  filters.languages?.forEach((value) => set('language', value));
  filters.tiers?.forEach((value) => set('tier', value));
  set('state', filters.stateCode);
  set('city', filters.city);
  set('minFollowers', filters.minFollowers);
  set('maxFollowers', filters.maxFollowers);
  set('minEngagement', filters.minEngagementPercent);
  set('minScore', filters.minScore);
  if (filters.isVerifiedOnly) set('verified', 1);
  if (filters.isOpenOnly) set('open', 1);
  set('gender', filters.audienceGender);
  set('age', filters.audienceAge);
  if (sort !== 'score') set('sort', sort);
  if (page > 1) set('page', page);
  return params.toString();
}

/** A query string as search params, with repeated keys collected into arrays. */
export function paramsFromQuery(query: string): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {};
  for (const [key, value] of new URLSearchParams(query)) {
    const existing = params[key];
    params[key] = existing === undefined ? value : [...[existing].flat(), value];
  }
  return params;
}

/** UC-D5: validates filters loaded from a saved search (they went through toSearchQuery). */
export function parseSavedFilters(raw: unknown): SearchFilters {
  if (raw === null || typeof raw !== 'object') return {};
  return parseSearchParams(paramsFromQuery(toSearchQuery(raw as SearchFilters))).filters;
}

/** FR-5.4 save-search form. */
export const saveSearchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'validation.required')
    .max(SAVED_SEARCH_NAME_MAX, 'validation.tooLong'),
  query: z.string().max(2000),
});
