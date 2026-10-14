import { createHash } from 'node:crypto';
import {
  type AccountStats,
  type AudienceShare,
  type PlatformAccount,
  type SocialPlatform,
  type SocialPlatformProvider,
  SocialProviderError,
} from './provider';

const DAY_MS = 86_400_000;
/** Mock post links look like https://mock.social/<account id>/<post name>. */
const MOCK_POST_HOST = 'mock.social';
const YEAR_DAYS = 365;
/** Fixed reference date so a given account's curve never changes between runs. */
const CURVE_START = Date.UTC(2026, 0, 1);

/**
 * Account ids containing these words make the mock fail the matching way, so development
 * and tests can exercise UC-C3/UC-C4 edge cases without a real platform.
 */
const SIMULATED_FAILURES: readonly [string, SocialProviderError['kind']][] = [
  ['revoked', 'TOKEN_REVOKED'],
  ['private', 'ACCOUNT_PRIVATE'],
  ['deleted', 'ACCOUNT_NOT_FOUND'],
  ['quota', 'QUOTA_EXCEEDED'],
  ['flaky', 'TRANSIENT'],
];

/** Stable pseudo-random number in [0, 1) for a seed and a salt. */
function unitRandom(seed: string, salt: string): number {
  const digest = createHash('sha256').update(`${seed}:${salt}`).digest();
  return digest.readUInt32BE(0) / 0x1_0000_0000;
}

function between(seed: string, salt: string, min: number, max: number): number {
  return min + unitRandom(seed, salt) * (max - min);
}

/** Deterministic statistics for an account on a given day. */
export function mockStatsFor(
  platform: SocialPlatform,
  externalId: string,
  now: Date,
): Omit<AccountStats, 'handle' | 'displayName'> {
  // Followers spread log-uniformly from 2k to 600k, so every tier is represented.
  const baseFollowers = Math.round(10 ** between(externalId, 'followers', 3.3, 5.78));
  const yearlyGrowth = between(externalId, 'growth', -0.05, 0.6);
  const daysElapsed = Math.max(0, (now.getTime() - CURVE_START) / DAY_MS);
  const followers = Math.round(baseFollowers * (1 + (yearlyGrowth * daysElapsed) / YEAR_DAYS));
  const posts30d = Math.round(between(externalId, 'posts', 1, platform === 'YOUTUBE' ? 10 : 20));
  const engagementShare = between(externalId, 'engagement', 0.005, 0.06);
  const interactionsPerPost = followers * engagementShare;
  const likes30d = Math.round(interactionsPerPost * posts30d * 0.9);
  const comments30d = Math.round(interactionsPerPost * posts30d * 0.1);
  const views30d =
    platform === 'YOUTUBE'
      ? Math.round(followers * between(externalId, 'views', 0.08, 0.6) * posts30d)
      : null;
  return {
    followers,
    isFollowerCountHidden: false,
    mediaCount: Math.round(between(externalId, 'media', 40, 900)),
    posts30d,
    views30d,
    likes30d,
    comments30d,
    audience: platform === 'INSTAGRAM' ? mockAudience(externalId) : null,
  };
}

function mockAudience(seed: string): AudienceShare[] {
  const female = Math.round(between(seed, 'female', 300, 700));
  const young = Math.round(between(seed, 'young', 250, 500));
  const middle = Math.round(between(seed, 'middle', 200, 400));
  return [
    { dimension: 'GENDER', bucket: 'F', sharePermille: female },
    { dimension: 'GENDER', bucket: 'M', sharePermille: 1000 - female },
    { dimension: 'AGE', bucket: '18-24', sharePermille: young },
    { dimension: 'AGE', bucket: '25-34', sharePermille: middle },
    { dimension: 'AGE', bucket: '35+', sharePermille: 1000 - young - middle },
  ];
}

function failIfSimulated(externalId: string): void {
  for (const [word, kind] of SIMULATED_FAILURES) {
    if (externalId.includes(word)) throw new SocialProviderError(kind, 'simulated');
  }
}

/**
 * Stand-in platform for development, tests and demo data (no API keys needed). Its "login"
 * goes through /api/social/mock/authorize, which returns straight to our callback.
 */
export function createMockProvider(
  platform: SocialPlatform,
  appUrl: string,
): SocialPlatformProvider {
  const prefix = platform === 'YOUTUBE' ? 'mock-yt' : 'mock-ig';
  const account = (id: string): PlatformAccount => ({
    externalId: id,
    handle: `@${id}`,
    displayName: `Mock ${platform === 'YOUTUBE' ? 'channel' : 'account'} ${id.slice(-6)}`,
  });

  return {
    platform,

    authorizationUrl({ state, redirectUri }) {
      const url = new URL('/api/social/mock/authorize', appUrl);
      url.search = new URLSearchParams({ state, redirect_uri: redirectUri }).toString();
      return url.toString();
    },

    async completeAuthorization({ code }) {
      // Codes look like "mock-<random>"; "personal" inside simulates UC-C3.
      if (code.includes('personal')) throw new SocialProviderError('PERSONAL_ACCOUNT');
      const id = `${prefix}-${code.replace(/^mock-/, '')}`;
      return {
        tokens: {
          accessToken: `mock-access-${id}`,
          refreshToken: platform === 'YOUTUBE' ? `mock-refresh-${id}` : null,
          expiresAt: new Date(Date.now() + 60 * 60_000),
        },
        accounts: [account(id)],
      };
    },

    async refreshTokens(tokens) {
      if (tokens.accessToken.includes('revoked')) throw new SocialProviderError('TOKEN_REVOKED');
      return { ...tokens, expiresAt: new Date(Date.now() + 60 * 60_000) };
    },

    async fetchStats({ externalId, now }) {
      failIfSimulated(externalId);
      return { ...account(externalId), ...mockStatsFor(platform, externalId, now) };
    },

    parsePostUrl(input) {
      let url: URL;
      try {
        url = new URL(input.trim());
      } catch {
        // Not a URL.
        return null;
      }
      const [accountId, postName] = url.pathname.split('/').filter(Boolean);
      if (url.hostname !== MOCK_POST_HOST || !accountId?.startsWith(prefix) || !postName) {
        return null;
      }
      return `${accountId}/${postName}`;
    },

    async fetchPostStats({ postId, accountExternalId }) {
      const [owner, postName = ''] = postId.split('/');
      // "deleted" and "private" in the post name simulate UC-R6 edge cases.
      if (owner !== accountExternalId || postName.includes('deleted')) return null;
      if (postName.includes('private'))
        throw new SocialProviderError('ACCOUNT_PRIVATE', 'simulated');
      const views = Math.round(between(postId, 'post-views', 2_000, 80_000));
      return {
        views: platform === 'YOUTUBE' ? views : null,
        likes: Math.round(views * between(postId, 'post-likes', 0.02, 0.08)),
        comments: Math.round(views * between(postId, 'post-comments', 0.001, 0.01)),
      };
    },

    async findPublicAccount(urlOrId) {
      if (platform !== 'YOUTUBE') return null;
      const reference = urlOrId
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(-30);
      return reference ? account(`${prefix}-public-${reference}`) : null;
    },
  };
}
