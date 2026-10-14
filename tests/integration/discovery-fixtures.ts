import type { DatabaseClient } from '@/adapters/db/client';
import { getOwnProfile } from '@/services/creators';
import { createVerifiedUser } from './accounts/fixtures';
import type { TestContext } from './test-context';

export interface CreatorSpec {
  readonly email: string;
  readonly displayName?: string;
  readonly bio?: string;
  readonly city?: string;
  readonly stateCode?: string;
  readonly languages?: readonly string[];
  readonly categories?: readonly string[];
  readonly platform?: 'YOUTUBE' | 'INSTAGRAM';
  readonly followers?: number;
  readonly engagementRateBp?: number;
  readonly score?: number;
  readonly growth90dBp?: number;
  readonly isVerified?: boolean;
  readonly isOpen?: boolean;
  /** Share of women in the audience, thousandths. */
  readonly womenPermille?: number;
}

let externalCounter = 0;

/**
 * A searchable creator with exact search columns, so tests can assert filters and sorts
 * precisely (the real values come from the score service, tested separately).
 */
export async function createSearchableCreator(
  ctx: TestContext,
  db: DatabaseClient,
  spec: CreatorSpec,
): Promise<{ creatorId: string; slug: string }> {
  const user = await createVerifiedUser(ctx, db, { email: spec.email });
  const profile = await getOwnProfile(ctx, user);
  const repos = ctx.repos;
  await repos.creators.updateFields(profile.id, {
    displayName: spec.displayName ?? 'Test Creator',
    bio: spec.bio ?? 'A creator used in tests.',
    city: spec.city ?? 'Chennai',
    stateCode: spec.stateCode ?? 'TN',
  });
  await repos.creators.replaceLanguages(profile.id, spec.languages ?? ['ta']);
  await repos.creators.replaceCategories(
    profile.id,
    await repos.creators.categoryIdsForSlugs('IN', spec.categories ?? ['food']),
  );
  await repos.creators.setAvailability(profile.id, spec.isOpen ?? true);
  externalCounter += 1;
  const accountId = await repos.socialAccounts.create({
    creatorId: profile.id,
    platform: spec.platform ?? 'YOUTUBE',
    externalId: `test-${Date.now()}-${externalCounter}`,
    handle: `@test${externalCounter}`,
    displayName: spec.displayName ?? 'Test Creator',
    isVerified: spec.isVerified ?? true,
    verifiedAt: null,
    accessTokenEncrypted: null,
    refreshTokenEncrypted: null,
    tokenExpiresAt: null,
  });
  if (spec.womenPermille !== undefined) {
    await repos.socialAccounts.replaceAudience(
      accountId,
      [
        { dimension: 'GENDER', bucket: 'F', sharePermille: spec.womenPermille },
        { dimension: 'GENDER', bucket: 'M', sharePermille: 1000 - spec.womenPermille },
      ],
      new Date(),
    );
  }
  await repos.socialAccounts.upsertSnapshot(accountId, ctx.clock.now(), {
    followers: spec.followers ?? 20_000,
    mediaCount: 100,
    posts30d: 8,
    views30d: 40_000,
    likes30d: 4_000,
    comments30d: 400,
  });
  await repos.creators.updateDerived(profile.id, {
    isSearchable: true,
    isVerified: spec.isVerified ?? true,
    tier: (spec.followers ?? 20_000) >= 100_000 ? 'MID' : 'MICRO',
    totalFollowers: spec.followers ?? 20_000,
    engagementRateBp: spec.engagementRateBp ?? 250,
    growth90dBp: spec.growth90dBp ?? 0,
    currentScore: spec.score ?? 60,
    scoreUpdatedAt: ctx.clock.now(),
    lastRefreshedAt: ctx.clock.now(),
  });
  return { creatorId: profile.id, slug: profile.slug };
}

/** A verified brand owner on a plan with every discovery feature. */
export async function createBrandOwner(
  ctx: TestContext,
  db: DatabaseClient,
  email: string,
  planCode: 'FREE_BETA' | 'TRIAL' | 'STARTER' | 'PRO' = 'PRO',
) {
  const owner = await createVerifiedUser(ctx, db, { email, role: 'BRAND' });
  const plan = await db.plan.findFirstOrThrow({ where: { code: planCode } });
  await db.brand.updateMany({
    where: { members: { some: { userId: owner.id } } },
    data: { planId: plan.id },
  });
  return owner;
}
