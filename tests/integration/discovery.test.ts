import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { SEARCH_COUNT_CAP, SEARCH_MAX_PAGE, SEARCH_PAGE_SIZE } from '@/config/search';
import { parseSavedFilters } from '@/lib/validation/search-schemas';
import { getCreatorAnalytics } from '@/services/creators';
import {
  compareCreators,
  deleteSavedSearch,
  listSavedSearches,
  loadSavedSearch,
  saveSearch,
  searchCreators,
  viewCreatorProfile,
  viewPublicProfile,
} from '@/services/discovery';
import { createBrandOwner, createSearchableCreator } from './discovery-fixtures';
import { createTestDatabaseClient } from './test-database';
import { createTestContext, requestFrom, resetDatabase, type TestContext } from './test-context';

const db = createTestDatabaseClient();
let ctx: TestContext;

beforeEach(async () => {
  await resetDatabase(db);
  ctx = createTestContext(db);
});
afterAll(() => db.$disconnect());

const search = (
  userId: string,
  filters = {},
  sort: 'score' | 'followers' | 'growth' = 'score',
  page = 1,
) => searchCreators(ctx, { userId, filters, sort, page });

describe('search (FR-5, UC-D1)', () => {
  it('FR-5.1 combines location, language, category, size, engagement and score filters', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    await createSearchableCreator(ctx, db, {
      email: 'match@example.in',
      displayName: 'Chennai Food Match',
      city: 'Chennai',
      languages: ['ta'],
      categories: ['food'],
      followers: 40_000,
      engagementRateBp: 300,
      score: 80,
    });
    await createSearchableCreator(ctx, db, {
      email: 'wrong-city@example.in',
      city: 'Madurai',
      score: 80,
    });
    await createSearchableCreator(ctx, db, { email: 'low-score@example.in', score: 40 });
    await createSearchableCreator(ctx, db, {
      email: 'travel@example.in',
      categories: ['travel'],
      score: 80,
    });

    const result = await search(brand.id, {
      stateCode: 'TN',
      city: 'chennai',
      languages: ['ta'],
      categories: ['food'],
      minFollowers: 30_000,
      minEngagementPercent: 2.5,
      minScore: 70,
    });

    expect(result.items.map((item) => item.displayName)).toEqual(['Chennai Food Match']);
    expect(result.total).toBe(1);
  });

  it('FR-5.2 finds creators by name or bio text', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    await createSearchableCreator(ctx, db, {
      email: 'a@example.in',
      displayName: 'Biryani Trails',
    });
    await createSearchableCreator(ctx, db, {
      email: 'b@example.in',
      displayName: 'Anu',
      bio: 'Weekly biryani reviews',
    });
    await createSearchableCreator(ctx, db, { email: 'c@example.in', displayName: 'Dosa Diaries' });

    const result = await search(brand.id, { query: 'BIRYANI' });

    expect(result.items.map((item) => item.displayName).sort()).toEqual(['Anu', 'Biryani Trails']);
  });

  it('FR-5.1 filters on verified, open and audience gender', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    await createSearchableCreator(ctx, db, {
      email: 'a@example.in',
      displayName: 'Fits',
      womenPermille: 700,
    });
    await createSearchableCreator(ctx, db, {
      email: 'b@example.in',
      isVerified: false,
      womenPermille: 700,
    });
    await createSearchableCreator(ctx, db, {
      email: 'c@example.in',
      isOpen: false,
      womenPermille: 700,
    });
    await createSearchableCreator(ctx, db, { email: 'd@example.in', womenPermille: 300 });

    const result = await search(brand.id, {
      isVerifiedOnly: true,
      isOpenOnly: true,
      audienceGender: 'F',
    });

    expect(result.items.map((item) => item.displayName)).toEqual(['Fits']);
  });

  it('FR-5.2 sorts by followers and by growth', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    await createSearchableCreator(ctx, db, {
      email: 'a@example.in',
      displayName: 'Big',
      followers: 90_000,
      growth90dBp: 100,
    });
    await createSearchableCreator(ctx, db, {
      email: 'b@example.in',
      displayName: 'Fast',
      followers: 15_000,
      growth90dBp: 900,
    });

    expect((await search(brand.id, {}, 'followers')).items.map((i) => i.displayName)).toEqual([
      'Big',
      'Fast',
    ]);
    expect((await search(brand.id, {}, 'growth')).items.map((i) => i.displayName)).toEqual([
      'Fast',
      'Big',
    ]);
  });

  it('UC-D1 never returns suspended or unsearchable creators', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const { creatorId } = await createSearchableCreator(ctx, db, { email: 'gone@example.in' });
    await db.user.updateMany({
      where: { creatorProfile: { id: creatorId } },
      data: { status: 'SUSPENDED' },
    });

    expect((await search(brand.id)).total).toBe(0);
  });

  it('FR-5.3 suggests a wider search when nothing matches', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    await createSearchableCreator(ctx, db, { email: 'a@example.in', city: 'Chennai' });

    const result = await search(brand.id, { stateCode: 'TN', city: 'Madurai' });

    expect(result.total).toBe(0);
    expect(result.suggestions).toEqual([
      {
        kind: 'cityToState',
        filters: { stateCode: 'TN', countryCode: 'IN' },
        total: 1,
        isTotalCapped: false,
      },
    ]);
  });

  it('NFR-1 stops counting at the last reachable page and still serves every page', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const overCap = SEARCH_COUNT_CAP + 1;
    await db.$executeRaw`
      INSERT INTO "User" (id, email, name, role, status, "countryCode", locale, "emailVerifiedAt", "updatedAt")
      SELECT 'bulk-u' || g, 'bulk-' || g || '@example.test', 'Bulk ' || g, 'CREATOR', 'ACTIVE', 'IN', 'en', now(), now()
      FROM generate_series(1, ${overCap}) AS g`;
    await db.$executeRaw`
      INSERT INTO "CreatorProfile" (id, "userId", slug, "displayName", city, "stateCode", "countryCode",
        "isSearchable", "currentScore", "updatedAt")
      SELECT 'bulk-c' || g, 'bulk-u' || g, 'bulk-' || g, 'Bulk ' || g, 'Chennai', 'TN', 'IN', true, g % 100, now()
      FROM generate_series(1, ${overCap}) AS g`;

    const first = await search(brand.id);
    const last = await search(brand.id, {}, 'score', SEARCH_MAX_PAGE);

    expect(first).toMatchObject({ total: SEARCH_COUNT_CAP, isTotalCapped: true });
    expect(first.pageCount).toBe(SEARCH_MAX_PAGE);
    expect(last.items).toHaveLength(SEARCH_PAGE_SIZE);
    expect(new Set([...first.items, ...last.items].map((item) => item.id)).size).toBe(
      2 * SEARCH_PAGE_SIZE,
    );
  });

  it('NFR-1 gives the exact total below the cap', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    await createSearchableCreator(ctx, db, { email: 'a@example.in' });

    await expect(search(brand.id)).resolves.toMatchObject({
      total: 1,
      isTotalCapped: false,
      pageCount: 1,
    });
  });

  it('UC-D1 caps the page number', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');

    await expect(search(brand.id, {}, 'score', 10_000)).resolves.toMatchObject({ page: 50 });
  });

  it('SR-12 search results never include contact details', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    await createSearchableCreator(ctx, db, { email: 'private@example.in' });

    const json = JSON.stringify(await search(brand.id));

    expect(json).not.toContain('private@example.in');
    expect(json).not.toContain('passwordHash');
  });

  it('SR-11 limits searches per user', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    for (let index = 0; index < 300; index += 1) {
      await ctx.repos.rateLimits.increment(
        (await import('@/adapters/crypto/random-token')).hashToken(`searchPerUser:${brand.id}`),
        new Date(Math.floor(ctx.clock.now().getTime() / 3_600_000) * 3_600_000),
      );
    }

    await expect(search(brand.id)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('SR-5 creators cannot search', async () => {
    const { creatorId: _ } = await createSearchableCreator(ctx, db, { email: 'c@example.in' });
    const creatorUser = await db.user.findUniqueOrThrow({ where: { email: 'c@example.in' } });

    await expect(search(creatorUser.id)).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });
});

describe('profile views (SEC-3, UC-C7)', () => {
  it('SEC-3 records views and stops at the plan’s hourly limit', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in', 'TRIAL');
    await db.plan.updateMany({ where: { code: 'TRIAL' }, data: { profileViewsPerHour: 2 } });
    const { slug } = await createSearchableCreator(ctx, db, { email: 'c@example.in' });

    await viewCreatorProfile(ctx, { userId: brand.id, slug });
    await viewCreatorProfile(ctx, { userId: brand.id, slug });

    await expect(viewCreatorProfile(ctx, { userId: brand.id, slug })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    ctx.clock.advance(61 * 60_000);
    await expect(viewCreatorProfile(ctx, { userId: brand.id, slug })).resolves.not.toBeNull();
  });

  it('UC-C7 creators see how many brand views they had', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const { slug } = await createSearchableCreator(ctx, db, { email: 'c@example.in' });
    await viewCreatorProfile(ctx, { userId: brand.id, slug });
    const creatorUser = await db.user.findUniqueOrThrow({ where: { email: 'c@example.in' } });

    expect((await getCreatorAnalytics(ctx, creatorUser.id)).profileViews30d).toBe(1);
  });

  it('SEC-3 public profile pages are rate-limited per IP', async () => {
    const { slug } = await createSearchableCreator(ctx, db, { email: 'c@example.in' });
    for (let index = 0; index < 120; index += 1) {
      await viewPublicProfile(ctx, slug, requestFrom('198.18.0.1'));
    }

    await expect(viewPublicProfile(ctx, slug, requestFrom('198.18.0.1'))).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    await expect(viewPublicProfile(ctx, slug, requestFrom('198.18.0.2'))).resolves.not.toBeNull();
  });
});

describe('saved searches (FR-5.4, UC-D5)', () => {
  it('FR-5.4 saves and lists searches for the brand', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');

    await saveSearch(ctx, {
      userId: brand.id,
      name: 'Chennai food',
      filters: { stateCode: 'TN', categories: ['food'] },
    });

    const saved = await listSavedSearches(ctx, brand.id);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.filters).toEqual({ stateCode: 'TN', categories: ['food'] });
  });

  it('UC-D5 drops filter values that no longer exist when rerun', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const id = await saveSearch(ctx, {
      userId: brand.id,
      name: 'Old',
      filters: { categories: ['food', 'retired-category'] },
    });

    const loaded = await loadSavedSearch(
      ctx,
      { userId: brand.id, savedSearchId: id },
      parseSavedFilters,
    );

    expect(loaded).toMatchObject({ filters: { categories: ['food'] }, hasDroppedValues: true });
  });

  it('FR-11 saving searches needs a plan that includes it', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in', 'TRIAL');

    await expect(
      saveSearch(ctx, { userId: brand.id, name: 'x', filters: {} }),
    ).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
  });

  it('SEC-2 another brand cannot load or delete a saved search', async () => {
    const owner = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const intruder = await createBrandOwner(ctx, db, 'intruder@other.in');
    const id = await saveSearch(ctx, { userId: owner.id, name: 'Mine', filters: {} });

    await expect(
      loadSavedSearch(ctx, { userId: intruder.id, savedSearchId: id }, parseSavedFilters),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      deleteSavedSearch(ctx, { userId: intruder.id, savedSearchId: id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('compare (FR-6.2, UC-D4)', () => {
  it('UC-D4 compares per platform and marks missing audience as not shared', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const yt = await createSearchableCreator(ctx, db, {
      email: 'yt@example.in',
      platform: 'YOUTUBE',
    });
    const ig = await createSearchableCreator(ctx, db, {
      email: 'ig@example.in',
      platform: 'INSTAGRAM',
      womenPermille: 650,
    });

    const rows = await compareCreators(ctx, {
      userId: brand.id,
      creatorIds: [yt.creatorId, ig.creatorId],
    });

    expect(rows.map((row) => row.platforms.map((p) => p.platform))).toEqual([
      ['YOUTUBE'],
      ['INSTAGRAM'],
    ]);
    expect(rows[0]?.audience).toEqual([]);
    expect(rows[1]?.audience).toContainEqual({
      dimension: 'GENDER',
      bucket: 'F',
      sharePermille: 650,
    });
    // (4,000 likes + 400 comments) / 8 posts / 20,000 followers = 2.75%.
    expect(rows[0]?.platforms[0]?.engagementRateBp).toBe(275);
  });

  it('UC-D4 needs 2 to 4 creators and a plan that includes compare', async () => {
    const brand = await createBrandOwner(ctx, db, 'owner@spiceco.in');
    const trial = await createBrandOwner(ctx, db, 'trial@other.in', 'TRIAL');
    const one = await createSearchableCreator(ctx, db, { email: 'one@example.in' });
    const two = await createSearchableCreator(ctx, db, { email: 'two@example.in' });

    await expect(
      compareCreators(ctx, { userId: brand.id, creatorIds: [one.creatorId] }),
    ).rejects.toMatchObject({ fieldErrors: { creatorIds: 'search.compareCount' } });
    await expect(
      compareCreators(ctx, { userId: trial.id, creatorIds: [one.creatorId, two.creatorId] }),
    ).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED' });
  });
});
