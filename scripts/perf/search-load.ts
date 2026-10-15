/**
 * NFR-1 search load test. Fills a separate scratch database with fake creators and times
 * the real search queries (results page + total count).
 *
 *   npm run perf:search -- 500000          # fill to 500k creators (kept for re-runs)
 *   npm run perf:search -- 500000 --drop   # ... and delete the scratch database afterwards
 *
 * Never touches the development or test databases, and refuses to run in production.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import {
  createDatabaseClient,
  DEFAULT_POOL_OPTIONS,
  type DatabaseClient,
} from '@/adapters/db/client';
import { createSearchRepository } from '@/adapters/db/search-repository';
import { CONTENT_LANGUAGES } from '@/config/languages';
import { REGION_CODES_BY_COUNTRY } from '@/config/regions';
import { SEARCH_PAGE_SIZE } from '@/config/search';
import type { SearchFilters, SearchSort } from '@/domain/search';
import { seedReferenceData } from '../../prisma/seed/reference-data';

const PERF_DATABASE = 'creator_platform_perf';
const BATCH_SIZE = 25_000;
const BULK_TIMEOUT_MS = 600_000;
/** Bulk inserts and ANALYZE run far longer than the app's statement timeout allows. */
const BULK_POOL_OPTIONS = { ...DEFAULT_POOL_OPTIONS, statementTimeoutMs: BULK_TIMEOUT_MS };
const RUNS_PER_CASE = 20;
const NFR1_TARGET_MS = 1000;

const CITIES = [
  'Chennai',
  'Madurai',
  'Mumbai',
  'Pune',
  'Bengaluru',
  'Hyderabad',
  'Kochi',
  'Delhi',
  'Jaipur',
  'Lucknow',
];
const NICHES = ['Food', 'Travel', 'Tech', 'Beauty', 'Fitness', 'Comedy', 'Finance', 'Music'];
const BIO_WORDS = [
  'biryani',
  'street food',
  'gadgets',
  'skincare',
  'yoga',
  'treks',
  'stocks',
  'covers',
];

function perfDatabaseUrl(): string {
  if (process.env.APP_ENV === 'production') throw new Error('Refusing to run in production.');
  const base = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is not set.');
  const url = new URL(base);
  url.pathname = `/${PERF_DATABASE}`;
  return url.toString();
}

async function ensureDatabase(adminDb: DatabaseClient): Promise<void> {
  const rows = await adminDb.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${PERF_DATABASE}) AS exists`;
  if (!rows[0]?.exists) await adminDb.$executeRawUnsafe(`CREATE DATABASE ${PERF_DATABASE}`);
}

function sqlArray(values: readonly string[]): string {
  return `ARRAY[${values.map((value) => `'${value.replaceAll("'", "''")}'`).join(',')}]`;
}

/** Inserts creators numbered from..to with varied, searchable data, in one statement set. */
async function insertBatch(db: DatabaseClient, from: number, to: number): Promise<void> {
  const states = sqlArray(REGION_CODES_BY_COUNTRY.IN ?? ['TN']);
  const languages = sqlArray(CONTENT_LANGUAGES.map((language) => language.code));
  const series = `generate_series(${from}, ${to}) AS g`;
  // Followers spread from 1k to ~600k with a skew towards smaller creators.
  const followers = `(1000 + ((g::bigint * 7919) % 600000) * ((g % 7) + 1) / 7)`;
  const statements = [
    `
      INSERT INTO "User" (id, email, name, role, status, "countryCode", locale, "emailVerifiedAt", "createdAt", "updatedAt")
      SELECT 'perfu' || g, 'perf-' || g || '@example.test', 'Perf creator ' || g, 'CREATOR', 'ACTIVE', 'IN', 'en', now(), now(), now()
      FROM ${series}`,
    `
      INSERT INTO "CreatorProfile" (id, "userId", slug, "displayName", bio, city, "stateCode", "countryCode",
        "isOpenToCollaborations", "isSearchable", "isVerified", tier, "totalFollowers", "engagementRateBp",
        "currentScore", "growth90dBp", "scoreUpdatedAt", "lastRefreshedAt", "createdAt", "updatedAt")
      SELECT 'perfc' || g, 'perfu' || g, 'perf-' || g,
        (${sqlArray(NICHES)})[1 + g % ${NICHES.length}] || ' creator ' || g,
        'Fake profile about ' || (${sqlArray(BIO_WORDS)})[1 + (g / 3) % ${BIO_WORDS.length}],
        (${sqlArray(CITIES)})[1 + g % ${CITIES.length}],
        (${states})[1 + g % array_length(${states}, 1)], 'IN',
        g % 5 <> 4, true, g % 3 <> 2,
        (CASE WHEN ${followers} < 10000 THEN 'NANO' WHEN ${followers} < 100000 THEN 'MICRO'
              WHEN ${followers} < 500000 THEN 'MID' ELSE 'MACRO' END)::"CreatorTier",
        ${followers}, (g * 37) % 900, 20 + (g * 13) % 80, (g * 11) % 500 - 100, now(), now(), now(), now()
      FROM ${series}`,
    `
      INSERT INTO "CreatorLanguage" (id, "creatorId", "languageCode", "createdAt", "updatedAt")
      SELECT 'perfl' || g || '-' || n, 'perfc' || g,
        (${languages})[1 + (g + n * 5) % array_length(${languages}, 1)], now(), now()
      FROM ${series}, generate_series(0, 1) AS n`,
    `
      INSERT INTO "CreatorCategory" (id, "creatorId", "categoryId", "createdAt", "updatedAt")
      SELECT 'perfk' || g || '-' || n, 'perfc' || g, cats.ids[1 + (g + n * 7) % array_length(cats.ids, 1)], now(), now()
      FROM ${series}, generate_series(0, 1) AS n,
        (SELECT array_agg(id ORDER BY slug) AS ids FROM "Category" WHERE "countryCode" = 'IN') AS cats`,
    `
      INSERT INTO "SocialAccount" (id, "creatorId", platform, "externalId", handle, "displayName", "isVerified", status, "createdAt", "updatedAt")
      SELECT 'perfs' || g, 'perfc' || g, (CASE WHEN g % 2 = 0 THEN 'INSTAGRAM' ELSE 'YOUTUBE' END)::"SocialPlatform",
        'perf-' || g, '@perf' || g, 'Perf ' || g, g % 3 <> 2, 'ACTIVE', now(), now()
      FROM ${series}`,
    `
      INSERT INTO "AudienceSegment" (id, "socialAccountId", dimension, bucket, "sharePermille", "capturedOn", "createdAt", "updatedAt")
      SELECT 'perfa' || g || '-' || b.bucket, 'perfs' || g, b.dimension::"AudienceDimension", b.bucket,
        CASE b.bucket WHEN 'F' THEN 300 + (g * 17) % 400 WHEN 'M' THEN 700 - (g * 17) % 400
             WHEN '18-24' THEN 250 + g % 250 ELSE 200 END,
        now(), now(), now()
      FROM ${series}, (VALUES ('GENDER', 'F'), ('GENDER', 'M'), ('AGE', '18-24'), ('AGE', '25-34')) AS b(dimension, bucket)
      WHERE g % 2 = 0`,
  ];
  // Bulk inserts need far longer than the app's 5 s interactive-transaction default.
  await db.$transaction(
    async (tx) => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
    },
    { timeout: BULK_TIMEOUT_MS, maxWait: BULK_TIMEOUT_MS },
  );
}

interface SearchCase {
  readonly name: string;
  readonly filters: SearchFilters;
  readonly sort: SearchSort;
  readonly page?: number;
}

const CASES: readonly SearchCase[] = [
  { name: 'No filters, by score (counts everyone)', filters: {}, sort: 'score' },
  {
    name: 'Audience mostly women + Instagram',
    filters: { audienceGender: 'F', platforms: ['INSTAGRAM'] },
    sort: 'score',
  },
  { name: 'State + category', filters: { stateCode: 'TN', categories: ['food'] }, sort: 'score' },
  { name: 'Sort by growth, page 50', filters: {}, sort: 'growth', page: 50 },
  { name: 'Text search in bio ("biryani")', filters: { query: 'biryani' }, sort: 'score' },
  {
    name: 'City + language',
    filters: { stateCode: 'TN', city: 'Chennai', languages: ['ta'] },
    sort: 'followers',
  },
  {
    name: 'Followers 10k-100k + engagement ≥ 3%',
    filters: { minFollowers: 10_000, maxFollowers: 100_000, minEngagementPercent: 3 },
    sort: 'engagement',
  },
  {
    name: 'Verified + open, by followers',
    filters: { isVerifiedOnly: true, isOpenOnly: true },
    sort: 'followers',
  },
  {
    name: 'Everything combined',
    filters: {
      stateCode: 'MH',
      categories: ['travel'],
      languages: ['hi'],
      tiers: ['MICRO'],
      minScore: 60,
      isVerifiedOnly: true,
      audienceGender: 'F',
    },
    sort: 'score',
  },
];

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)] ?? 0;
}

async function main(): Promise<void> {
  const target = Number(process.argv[2] ?? 500_000);
  const shouldDrop = process.argv.includes('--drop');
  if (!Number.isInteger(target) || target < 1)
    throw new Error('Usage: perf:search -- <count> [--drop]');

  const adminDb = createDatabaseClient(process.env.DATABASE_URL ?? '');
  await ensureDatabase(adminDb);
  const url = perfDatabaseUrl();
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  const db = createDatabaseClient(url, BULK_POOL_OPTIONS);
  try {
    await seedReferenceData(db);
    const existing = await db.creatorProfile.count();
    for (let from = existing + 1; from <= target; from += BATCH_SIZE) {
      const to = Math.min(target, from + BATCH_SIZE - 1);
      const started = Date.now();
      await insertBatch(db, from, to);
      console.log(
        `inserted creators ${from}-${to} in ${Math.round((Date.now() - started) / 1000)} s`,
      );
    }
    await db.$executeRawUnsafe('ANALYZE');

    // Searches run with the app's real pool settings, including its statement timeout.
    const appDb = createDatabaseClient(url);
    const search = createSearchRepository(appDb);
    console.log(
      `\n${target.toLocaleString('en-IN')} creators, ${RUNS_PER_CASE} timed runs per search after one warm-up (results page + total)\n`,
    );
    console.log('| Search | p50 | p95 | Results |');
    console.log('| --- | --- | --- | --- |');
    let worst = 0;
    for (const searchCase of CASES) {
      const runSearch = () =>
        search.search({ ...searchCase.filters, countryCode: 'IN' }, searchCase.sort, {
          offset: ((searchCase.page ?? 1) - 1) * SEARCH_PAGE_SIZE,
          limit: SEARCH_PAGE_SIZE,
        });
      // Warm-up: a busy production database has these pages cached; a laptop has not.
      const { total, isTotalCapped } = await runSearch();
      const times: number[] = [];
      for (let run = 0; run < RUNS_PER_CASE; run += 1) {
        const started = performance.now();
        await runSearch();
        times.push(performance.now() - started);
      }
      const p95 = percentile(times, 0.95);
      worst = Math.max(worst, p95);
      console.log(
        `| ${searchCase.name} | ${Math.round(percentile(times, 0.5))} ms | ${Math.round(p95)} ms | ${total.toLocaleString('en-IN')}${isTotalCapped ? '+' : ''} |`,
      );
    }
    await appDb.$disconnect();
    console.log(
      `\nWorst p95: ${Math.round(worst)} ms (NFR-1 target ${NFR1_TARGET_MS} ms) → ${worst <= NFR1_TARGET_MS ? 'PASS' : 'FAIL'}`,
    );
  } finally {
    await db.$disconnect();
    if (shouldDrop)
      await adminDb.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${PERF_DATABASE} WITH (FORCE)`);
    await adminDb.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
