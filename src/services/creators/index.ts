/** Creators module: profiles, rate cards, portfolio, photos and public profiles (FR-2, UC-C1/C6/C7). */
import { randomBytes } from 'node:crypto';
import type {
  CreatorProfileRecord,
  Deliverable,
  PortfolioEntry,
} from '@/adapters/db/creator-repository';
import type { UserRecord } from '@/adapters/db/user-repository';
import { PROFILE_LIMITS, PROFILE_PHOTO } from '@/config/creators';
import { COUNTRY_SETTINGS } from '@/config/countries';
import { REGION_CODES_BY_COUNTRY } from '@/config/regions';
import { containsProfanity, findContactDetails } from '@/domain/content-safety';
import { missingProfileFields, type ProfileField, slugBaseFrom } from '@/domain/creators';
import { notAllowed, notFound, validationFailed } from '@/domain/errors';
import { detectImageType } from '@/domain/file-types';
import type { ScoreBreakdown } from '@/domain/score';
import type { ServiceContext } from '../context';
import { completenessOf, recomputeCreatorScore } from '../scoring';

const SLUG_SUFFIX_BYTES = 3;
const PAISE_PER_RUPEE = 100;

function assertCreator(user: Pick<UserRecord, 'role'>): void {
  if (user.role !== 'CREATOR') throw notAllowed();
}

async function requireOwnProfile(
  ctx: ServiceContext,
  userId: string,
): Promise<CreatorProfileRecord> {
  const profile = await ctx.repos.creators.findByUserId(userId);
  if (!profile) throw notFound();
  return profile;
}

async function uniqueSlug(ctx: ServiceContext, displayName: string): Promise<string> {
  const base = slugBaseFrom(displayName);
  for (;;) {
    const candidate = `${base}-${randomBytes(SLUG_SUFFIX_BYTES).toString('hex')}`;
    if (!(await ctx.repos.creators.isSlugTaken(candidate))) return candidate;
  }
}

/** The creator's own profile, created on first use with their account name. */
export async function getOwnProfile(
  ctx: ServiceContext,
  user: Pick<UserRecord, 'id' | 'role' | 'name' | 'countryCode'>,
): Promise<CreatorProfileRecord> {
  assertCreator(user);
  const existing = await ctx.repos.creators.findByUserId(user.id);
  if (existing) return existing;
  await ctx.repos.creators.create({
    userId: user.id,
    slug: await uniqueSlug(ctx, user.name),
    displayName: user.name,
    countryCode: user.countryCode,
  });
  return requireOwnProfile(ctx, user.id);
}

/** Missing fields for the "complete your profile" checklist (FR-4.2). */
export function profileChecklist(profile: CreatorProfileRecord): {
  completenessPercent: number;
  missing: ProfileField[];
} {
  return {
    completenessPercent: completenessOf(profile),
    missing: missingProfileFields({
      displayName: profile.displayName,
      bio: profile.bio,
      hasPhoto: profile.photoKey !== null,
      city: profile.city,
      stateCode: profile.stateCode,
      languageCount: profile.languageCodes.length,
      categoryCount: profile.categorySlugs.length,
      rateCardCount: profile.rateCard.length,
      portfolioCount: profile.portfolio.length,
      connectedAccountCount: profile.accounts.length,
    }),
  };
}

export interface ProfileDetailsInput {
  readonly displayName: string;
  readonly bio: string;
  readonly city: string;
  readonly stateCode: string;
  readonly languageCodes: readonly string[];
  readonly categorySlugs: readonly string[];
}

/** Rejects bios with contact details (SR-12) or profanity (UC-C1). */
function assertSafeText(field: string, text: string): void {
  if (findContactDetails(text).length > 0) {
    throw validationFailed({ [field]: 'profile.noContactDetails' });
  }
  if (containsProfanity(text)) throw validationFailed({ [field]: 'profile.noProfanity' });
}

/**
 * FR-2.1 / UC-C1: saves name, bio, location, languages and categories. Bios can't carry
 * contact details or profanity; the state must be one of the country's; the city is free
 * text (unsupported cities are mapped later).
 */
export async function updateProfileDetails(
  ctx: ServiceContext,
  userId: string,
  input: ProfileDetailsInput,
): Promise<void> {
  const profile = await requireOwnProfile(ctx, userId);
  assertSafeText('displayName', input.displayName);
  assertSafeText('bio', input.bio);
  const regions = REGION_CODES_BY_COUNTRY[profile.countryCode] ?? [];
  if (!regions.includes(input.stateCode)) {
    throw validationFailed({ stateCode: 'validation.invalidChoice' });
  }
  const languages = await ctx.repos.creators.listLanguages();
  const knownLanguages = new Set(languages.map((language) => language.code));
  if (!input.languageCodes.every((code) => knownLanguages.has(code))) {
    throw validationFailed({ languageCodes: 'validation.invalidChoice' });
  }
  const categoryIds = await ctx.repos.creators.categoryIdsForSlugs(
    profile.countryCode,
    input.categorySlugs,
  );
  if (categoryIds.length !== input.categorySlugs.length) {
    throw validationFailed({ categorySlugs: 'validation.invalidChoice' });
  }

  await ctx.transaction(async (repos) => {
    await repos.creators.updateFields(profile.id, {
      displayName: input.displayName,
      bio: input.bio,
      city: input.city,
      stateCode: input.stateCode,
    });
    await repos.creators.replaceLanguages(profile.id, input.languageCodes);
    await repos.creators.replaceCategories(profile.id, categoryIds);
  });
  await recomputeCreatorScore(ctx, profile.id);
}

/** UC-C6: open or closed to collaborations. Closed creators don't receive new requests. */
export async function setAvailability(
  ctx: ServiceContext,
  userId: string,
  isOpen: boolean,
): Promise<void> {
  const profile = await requireOwnProfile(ctx, userId);
  await ctx.repos.creators.setAvailability(profile.id, isOpen);
}

/**
 * UC-C6: prices per deliverable in whole rupees, stored as paise in the country's currency
 * (CLAUDE.md §5 money rules). An empty list clears the rate card.
 */
export async function updateRateCard(
  ctx: ServiceContext,
  userId: string,
  prices: readonly { deliverable: Deliverable; rupees: number }[],
): Promise<void> {
  const profile = await requireOwnProfile(ctx, userId);
  const currency =
    COUNTRY_SETTINGS.find((country) => country.code === profile.countryCode)?.currencyCode ?? 'INR';
  await ctx.repos.creators.replaceRateCard(
    profile.id,
    prices.map((price) => ({
      deliverable: price.deliverable,
      amountMinor: Math.round(price.rupees * PAISE_PER_RUPEE),
      currency,
    })),
  );
  await recomputeCreatorScore(ctx, profile.id);
}

/** FR-2.2: adds a past brand collaboration (up to 20). */
export async function addPortfolioItem(
  ctx: ServiceContext,
  userId: string,
  item: { url: string; brandName: string; collaboratedOn: Date },
): Promise<void> {
  const profile = await requireOwnProfile(ctx, userId);
  assertSafeText('brandName', item.brandName);
  if (
    (await ctx.repos.creators.countPortfolioItems(profile.id)) >= PROFILE_LIMITS.maxPortfolioItems
  ) {
    throw validationFailed({ url: 'profile.portfolioFull' });
  }
  if (item.collaboratedOn.getTime() > ctx.clock.now().getTime()) {
    throw validationFailed({ collaboratedOn: 'profile.dateInFuture' });
  }
  await ctx.repos.creators.addPortfolioItem(profile.id, item);
  await recomputeCreatorScore(ctx, profile.id);
}

/** FR-2.2: removes a portfolio item; other creators' items look "not found" (SR-5). */
export async function removePortfolioItem(
  ctx: ServiceContext,
  userId: string,
  itemId: string,
): Promise<void> {
  const profile = await requireOwnProfile(ctx, userId);
  if (!(await ctx.repos.creators.removePortfolioItem(profile.id, itemId))) throw notFound();
  await recomputeCreatorScore(ctx, profile.id);
}

/**
 * FR-2.1 / SR-9: sets the profile photo. The real file type is read from its bytes (the
 * browser's claim is ignored), it is scanned for malware, and stored under a random key.
 */
export async function uploadProfilePhoto(
  ctx: ServiceContext,
  userId: string,
  bytes: Buffer,
): Promise<void> {
  const profile = await requireOwnProfile(ctx, userId);
  if (bytes.length === 0 || bytes.length > PROFILE_PHOTO.maxBytes) {
    throw validationFailed({ photo: 'profile.photoTooLarge' });
  }
  const contentType = detectImageType(bytes);
  if (!contentType || !PROFILE_PHOTO.allowedMimeTypes.includes(contentType)) {
    throw validationFailed({ photo: 'profile.photoType' });
  }
  if ((await ctx.malwareScanner.scan(bytes)) !== 'CLEAN') {
    throw validationFailed({ photo: 'profile.photoRejected' });
  }
  const key = `photos/${randomBytes(24).toString('base64url')}`;
  await ctx.fileStorage.put(key, { bytes, contentType });
  await ctx.repos.creators.setPhotoKey(profile.id, key);
  if (profile.photoKey) await ctx.fileStorage.delete(profile.photoKey);
  await recomputeCreatorScore(ctx, profile.id);
}

/** What brands and visitors see on a creator profile (FR-2.4, PR-8). No contact details. */
export interface PublicCreatorProfile {
  readonly slug: string;
  readonly displayName: string;
  readonly bio: string;
  readonly photoKey: string | null;
  readonly city: string;
  readonly stateCode: string;
  readonly countryCode: string;
  readonly isOpenToCollaborations: boolean;
  readonly isVerified: boolean;
  readonly tier: CreatorProfileRecord['tier'];
  readonly totalFollowers: number;
  readonly engagementRateBp: number;
  readonly languageCodes: readonly string[];
  readonly categorySlugs: readonly string[];
  readonly rateCard: CreatorProfileRecord['rateCard'];
  readonly portfolio: readonly PortfolioEntry[];
  readonly accounts: readonly {
    readonly platform: 'YOUTUBE' | 'INSTAGRAM';
    readonly handle: string;
    readonly isVerified: boolean;
  }[];
  readonly score: {
    readonly value: number;
    readonly breakdown: ScoreBreakdown['components'];
    readonly weightsVersion: string;
  } | null;
  readonly audience: readonly { dimension: string; bucket: string; sharePermille: number }[];
  /** UC-D2: shown so stale data is obvious. */
  readonly lastRefreshedAt: Date | null;
}

/**
 * FR-2.4 / UC-D2: a creator's public profile, or null when it is unavailable (unknown,
 * suspended, or the account owner is not active).
 */
export async function getPublicProfile(
  ctx: ServiceContext,
  slug: string,
): Promise<PublicCreatorProfile | null> {
  const profile = await ctx.repos.creators.findBySlug(slug);
  if (!profile) return null;
  const owner = await ctx.repos.users.findById(profile.userId);
  if (owner?.status !== 'ACTIVE') return null;
  const [score, audience] = await Promise.all([
    ctx.repos.scores.latestForCreator(profile.id),
    ctx.repos.socialAccounts.audienceForCreator(profile.id),
  ]);
  return {
    slug: profile.slug,
    displayName: profile.displayName,
    bio: profile.bio,
    photoKey: profile.photoKey,
    city: profile.city,
    stateCode: profile.stateCode,
    countryCode: profile.countryCode,
    isOpenToCollaborations: profile.isOpenToCollaborations,
    isVerified: profile.isVerified,
    tier: profile.tier,
    totalFollowers: profile.totalFollowers,
    engagementRateBp: profile.engagementRateBp,
    languageCodes: profile.languageCodes,
    categorySlugs: profile.categorySlugs,
    rateCard: profile.rateCard,
    portfolio: profile.portfolio,
    accounts: profile.accounts
      .filter((account) => account.status === 'ACTIVE')
      .map(({ platform, handle, isVerified }) => ({ platform, handle, isVerified })),
    score: score
      ? { value: score.score, breakdown: score.components, weightsVersion: score.weightsVersion }
      : null,
    audience,
    lastRefreshedAt: profile.lastRefreshedAt,
  };
}

const ANALYTICS_DAYS = 120;
const DAY_MS = 86_400_000;

/** UC-C7: the creator's growth charts and score breakdown. */
export async function getCreatorAnalytics(ctx: ServiceContext, userId: string) {
  const profile = await requireOwnProfile(ctx, userId);
  const since = new Date(ctx.clock.now().getTime() - ANALYTICS_DAYS * DAY_MS);
  const [series, score] = await Promise.all([
    ctx.repos.socialAccounts.followerSeries(profile.id, since),
    ctx.repos.scores.latestForCreator(profile.id),
  ]);
  return { profile, series, score, checklist: profileChecklist(profile) };
}
