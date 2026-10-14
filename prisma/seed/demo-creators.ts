import { createArgon2PasswordHasher } from '@/adapters/crypto/password-hasher';
import { createAesGcmTokenCipher } from '@/adapters/crypto/token-cipher';
import type { DatabaseClient } from '@/adapters/db/client';
import { createRepositories } from '@/adapters/db/repositories';
import { utcDay } from '@/adapters/db/social-account-repository';
import { createTransactionRunner } from '@/adapters/db/transaction';
import { mockStatsFor } from '@/adapters/social/mock-provider';
import type { SocialPlatform } from '@/adapters/social/provider';
import { LAUNCH_COUNTRY_CODE } from '@/config/countries';
import { createAccount } from '@/services/accounts';
import { recomputeCreatorScore } from '@/services/scoring';
import { DEMO_PASSWORD } from './demo-accounts';

/**
 * ~60 clearly fake creators (CLAUDE.md §8: demo data is obviously fake) spread over Indian
 * cities, languages and categories, each with mock YouTube/Instagram accounts and 120 days
 * of history, so search, profiles and scores have something to show without API keys.
 */

const DEMO_CREATOR_COUNT = 60;
const HISTORY_DAYS = 120;
const DAY_MS = 86_400_000;
/** This creator gets a follower jump so the authenticity-flag path has demo data. */
const SPIKE_CREATOR_INDEX = 7;

const PLACES: readonly { city: string; stateCode: string; languages: readonly string[] }[] = [
  { city: 'Chennai', stateCode: 'TN', languages: ['ta', 'en'] },
  { city: 'Coimbatore', stateCode: 'TN', languages: ['ta'] },
  { city: 'Bengaluru', stateCode: 'KA', languages: ['kn', 'en'] },
  { city: 'Mysuru', stateCode: 'KA', languages: ['kn'] },
  { city: 'Hyderabad', stateCode: 'TS', languages: ['te', 'hi', 'ur'] },
  { city: 'Visakhapatnam', stateCode: 'AP', languages: ['te'] },
  { city: 'Mumbai', stateCode: 'MH', languages: ['hi', 'mr', 'en'] },
  { city: 'Pune', stateCode: 'MH', languages: ['mr'] },
  { city: 'Kolkata', stateCode: 'WB', languages: ['bn', 'en'] },
  { city: 'Delhi', stateCode: 'DL', languages: ['hi', 'en'] },
  { city: 'Jaipur', stateCode: 'RJ', languages: ['hi'] },
  { city: 'Lucknow', stateCode: 'UP', languages: ['hi', 'ur'] },
  { city: 'Ahmedabad', stateCode: 'GJ', languages: ['gu', 'hi'] },
  { city: 'Surat', stateCode: 'GJ', languages: ['gu'] },
  { city: 'Kochi', stateCode: 'KL', languages: ['ml', 'en'] },
  { city: 'Bhubaneswar', stateCode: 'OD', languages: ['or'] },
  { city: 'Guwahati', stateCode: 'AS', languages: ['as', 'en'] },
  { city: 'Chandigarh', stateCode: 'CH', languages: ['pa', 'hi'] },
  { city: 'Indore', stateCode: 'MP', languages: ['hi'] },
  { city: 'Patna', stateCode: 'BR', languages: ['hi', 'bho'] },
];

const NICHES: readonly { label: string; categories: readonly string[] }[] = [
  { label: 'Kitchen', categories: ['food'] },
  { label: 'Street Eats', categories: ['food', 'travel'] },
  { label: 'Wanderer', categories: ['travel', 'lifestyle'] },
  { label: 'Style Diary', categories: ['fashion', 'beauty'] },
  { label: 'Glow Notes', categories: ['beauty'] },
  { label: 'Fit Daily', categories: ['fitness', 'health'] },
  { label: 'Tech Talks', categories: ['tech'] },
  { label: 'Game Den', categories: ['gaming'] },
  { label: 'Study Hub', categories: ['education'] },
  { label: 'Money Matters', categories: ['finance', 'education'] },
  { label: 'Laugh Lab', categories: ['comedy'] },
  { label: 'Music Room', categories: ['music', 'dance'] },
  { label: 'Parent Life', categories: ['parenting', 'lifestyle'] },
  { label: 'Farm Stories', categories: ['agriculture'] },
  { label: 'Home Corner', categories: ['home-decor', 'lifestyle'] },
];

const FIRST_NAMES = [
  'Aarav',
  'Diya',
  'Kabir',
  'Meera',
  'Rohan',
  'Ananya',
  'Vikram',
  'Isha',
  'Arjun',
  'Sana',
  'Dev',
  'Kavya',
  'Nikhil',
  'Pooja',
  'Rahul',
  'Tara',
  'Yash',
  'Zoya',
  'Aditi',
  'Farhan',
];

function pad(index: number): string {
  return String(index).padStart(2, '0');
}

interface DemoCreatorSpec {
  readonly index: number;
  readonly email: string;
  readonly displayName: string;
  readonly place: (typeof PLACES)[number];
  readonly niche: (typeof NICHES)[number];
  readonly platforms: readonly SocialPlatform[];
  readonly isVerified: boolean;
  readonly isOpen: boolean;
}

function specFor(index: number): DemoCreatorSpec {
  const place = PLACES[index % PLACES.length] ?? PLACES[0];
  const niche = NICHES[(index * 7) % NICHES.length] ?? NICHES[0];
  const firstName = FIRST_NAMES[(index * 3) % FIRST_NAMES.length] ?? 'Demo';
  if (!place || !niche) throw new Error('demo data tables are empty');
  const platforms: SocialPlatform[] =
    index % 3 === 0 ? ['YOUTUBE', 'INSTAGRAM'] : index % 3 === 1 ? ['INSTAGRAM'] : ['YOUTUBE'];
  return {
    index,
    email: `demo-creator-${pad(index)}@example.test`,
    displayName: `${firstName}'s ${niche.label} (demo)`,
    place,
    niche,
    platforms,
    isVerified: index % 3 !== 2,
    isOpen: index % 5 !== 4,
  };
}

/** Creates the demo creators if they don't exist yet. Safe to run repeatedly. */
export async function seedDemoCreators(
  db: DatabaseClient,
  tokenEncryptionKey: string,
): Promise<number> {
  const repos = createRepositories(db);
  const transaction = createTransactionRunner(db);
  if (await repos.users.findByEmail(specFor(1).email)) return 0;

  const passwordHash = await createArgon2PasswordHasher().hash(DEMO_PASSWORD);
  const cipher = createAesGcmTokenCipher(tokenEncryptionKey);
  const now = new Date();
  const clock = { now: () => now };
  const categoryIds = new Map(
    (await db.category.findMany({ where: { countryCode: LAUNCH_COUNTRY_CODE } })).map((c) => [
      c.slug,
      c.id,
    ]),
  );

  for (let index = 1; index <= DEMO_CREATOR_COUNT; index += 1) {
    const spec = specFor(index);
    const creatorId = await transaction(async (tx) => {
      const user = await createAccount(
        tx,
        now,
        {
          role: 'CREATOR',
          name: spec.displayName,
          email: spec.email,
          passwordHash,
          locale: index % 4 === 0 ? 'hi' : 'en',
          acceptsMarketing: false,
          emailVerifiedAt: now,
        },
        null,
      );
      const id = await tx.creators.create({
        userId: user.id,
        slug: `demo-creator-${pad(index)}`,
        displayName: spec.displayName,
        countryCode: LAUNCH_COUNTRY_CODE,
      });
      await tx.creators.updateFields(id, {
        displayName: spec.displayName,
        bio: `Demo profile, not a real creator. ${spec.niche.label} content from ${spec.place.city}, made up for testing the platform.`,
        city: spec.place.city,
        stateCode: spec.place.stateCode,
      });
      await tx.creators.setAvailability(id, spec.isOpen);
      await tx.creators.replaceLanguages(id, spec.place.languages);
      await tx.creators.replaceCategories(
        id,
        spec.niche.categories
          .map((slug) => categoryIds.get(slug))
          .filter((v): v is string => Boolean(v)),
      );
      await tx.creators.replaceRateCard(id, [
        { deliverable: 'REEL', amountMinor: (2_000 + index * 250) * 100, currency: 'INR' },
        { deliverable: 'STORY', amountMinor: (800 + index * 100) * 100, currency: 'INR' },
      ]);
      if (index % 2 === 0) {
        await tx.creators.addPortfolioItem(id, {
          url: `https://example.test/demo-collab-${pad(index)}`,
          brandName: 'Demo Brand (fake)',
          collaboratedOn: new Date(now.getTime() - index * 7 * DAY_MS),
        });
      }
      return id;
    });

    for (const platform of spec.platforms) {
      const externalId = `${platform === 'YOUTUBE' ? 'mock-yt' : 'mock-ig'}-seed-${pad(index)}`;
      const accountId = await repos.socialAccounts.create({
        creatorId,
        platform,
        externalId,
        handle: `@demo_${spec.niche.label.toLowerCase().replace(/\W+/g, '_')}_${pad(index)}`,
        displayName: spec.displayName,
        isVerified: spec.isVerified,
        verifiedAt: spec.isVerified ? now : null,
        accessTokenEncrypted: spec.isVerified ? cipher.encrypt(`mock-access-${externalId}`) : null,
        refreshTokenEncrypted: null,
        tokenExpiresAt: null,
      });
      const snapshots = Array.from({ length: HISTORY_DAYS }, (_, dayIndex) => {
        const day = new Date(now.getTime() - (HISTORY_DAYS - 1 - dayIndex) * DAY_MS);
        const stats = mockStatsFor(platform, externalId, day);
        const isSpike = index === SPIKE_CREATOR_INDEX && dayIndex >= HISTORY_DAYS - 10;
        return {
          socialAccountId: accountId,
          capturedOn: utcDay(day),
          followers: isSpike ? Math.round(stats.followers * 1.6) : stats.followers,
          mediaCount: stats.mediaCount,
          posts30d: stats.posts30d,
          views30d: stats.views30d,
          likes30d: stats.likes30d,
          comments30d: stats.comments30d,
        };
      });
      await db.statsSnapshot.createMany({ data: snapshots });
      const latest = mockStatsFor(platform, externalId, now);
      if (latest.audience) {
        await repos.socialAccounts.replaceAudience(accountId, latest.audience, now);
      }
      await repos.socialAccounts.recordRefreshSuccess(accountId, {
        handle: `@demo_${spec.niche.label.toLowerCase().replace(/\W+/g, '_')}_${pad(index)}`,
        displayName: spec.displayName,
        isFollowerCountHidden: false,
        at: now,
      });
    }
    await recomputeCreatorScore({ transaction, clock }, creatorId);
  }
  return DEMO_CREATOR_COUNT;
}
