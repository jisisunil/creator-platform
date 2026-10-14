import { SOCIAL_REFRESH } from '@/config/creators';
import { pick, recentWindowStart, requestJson, toCount } from './http';
import {
  type AccountStats,
  type AudienceDimension,
  type AudienceShare,
  type PlatformAccount,
  type ProviderTokens,
  type SocialPlatformProvider,
  SocialProviderError,
} from './provider';

const GRAPH = 'https://graph.instagram.com';
const GRAPH_VERSION = 'v23.0';
const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const SHORT_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
// Least privilege (SR-6): profile, media counts and audience insights, nothing else.
const SCOPES = 'instagram_business_basic,instagram_business_manage_insights';
const PROFESSIONAL_ACCOUNT_TYPES = new Set(['BUSINESS', 'MEDIA_CREATOR']);
const PERMILLE = 1000;
/** UC-R6: a deal's post is looked up among the account's latest posts. */
const MAX_MEDIA_LOOKUP = 100;
const SHORTCODE_PATTERN = /^[\w-]{5,40}$/;
const POST_PATH_KINDS = new Set(['p', 'reel', 'reels', 'tv']);

// Graph API error codes (developers.facebook.com/docs/graph-api/guides/error-handling).
const EXPIRED_OR_REVOKED_TOKEN = 190;
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const NOT_FOUND_CODE = 100;

export interface InstagramConfig {
  readonly appId: string;
  readonly appSecret: string;
}

function instagramError(status: number, body: unknown): SocialProviderError {
  const code = toCount(pick(body, 'error', 'code'));
  const message = String(pick(body, 'error', 'message') ?? pick(body, 'error_message') ?? '');
  if (code === EXPIRED_OR_REVOKED_TOKEN || status === 401) {
    return new SocialProviderError('TOKEN_REVOKED', message);
  }
  if (RATE_LIMIT_CODES.has(code) || status === 429) {
    return new SocialProviderError('QUOTA_EXCEEDED', message);
  }
  if (code === NOT_FOUND_CODE && /does not exist|cannot be loaded/i.test(message)) {
    return new SocialProviderError('ACCOUNT_NOT_FOUND', message);
  }
  return new SocialProviderError('INVALID_REQUEST', `${status} ${code} ${message}`);
}

function longLivedTokensFrom(body: unknown, now: Date): ProviderTokens {
  const accessToken = pick(body, 'access_token');
  if (typeof accessToken !== 'string') throw new SocialProviderError('INVALID_REQUEST', 'no token');
  const expiresIn = toCount(pick(body, 'expires_in'));
  return {
    accessToken,
    // Instagram refreshes long-lived tokens with the token itself; there is no refresh token.
    refreshToken: null,
    expiresAt: expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null,
  };
}

/**
 * Instagram via the official Instagram API with Instagram Login (no scraping). Only
 * Business and Creator accounts can use it; personal accounts get PERSONAL_ACCOUNT so the
 * page can explain how to switch (UC-C3).
 */
export function createInstagramProvider(
  config: InstagramConfig,
  fetchImpl: typeof fetch = fetch,
): SocialPlatformProvider {
  async function graphGet(path: string, params: Record<string, string>) {
    const url = new URL(`${GRAPH}/${GRAPH_VERSION}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await requestJson(fetchImpl, url.toString());
    if (response.status !== 200) throw instagramError(response.status, response.body);
    return response.body;
  }

  async function audienceBreakdown(
    externalId: string,
    accessToken: string,
  ): Promise<AudienceShare[] | null> {
    const breakdowns: [AudienceDimension, string][] = [
      ['AGE', 'age'],
      ['GENDER', 'gender'],
      ['CITY', 'city'],
    ];
    const shares: AudienceShare[] = [];
    for (const [dimension, breakdown] of breakdowns) {
      let body: unknown;
      try {
        body = await graphGet(`${externalId}/insights`, {
          metric: 'follower_demographics',
          period: 'lifetime',
          metric_type: 'total_value',
          breakdown,
          access_token: accessToken,
        });
      } catch (error) {
        // UC-C3: insights permission not granted, or too few followers for demographics.
        if (error instanceof SocialProviderError && error.kind === 'INVALID_REQUEST') return null;
        throw error;
      }
      const results = pick(body, 'data', 0, 'total_value', 'breakdowns', 0, 'results');
      const rows = (Array.isArray(results) ? results : []).map((row) => ({
        bucket: String(pick(row, 'dimension_values', 0) ?? 'unknown'),
        count: toCount(pick(row, 'value')),
      }));
      const total = rows.reduce((sum, row) => sum + row.count, 0);
      if (total === 0) continue;
      for (const row of rows) {
        shares.push({
          dimension,
          bucket: row.bucket,
          sharePermille: Math.round((row.count / total) * PERMILLE),
        });
      }
    }
    return shares.length > 0 ? shares : null;
  }

  return {
    platform: 'INSTAGRAM',

    authorizationUrl({ state, redirectUri }) {
      const url = new URL(AUTHORIZE_URL);
      url.search = new URLSearchParams({
        client_id: config.appId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES,
        state,
      }).toString();
      return url.toString();
    },

    async completeAuthorization({ code, redirectUri }) {
      const now = new Date();
      const shortLived = await requestJson(fetchImpl, SHORT_TOKEN_URL, {
        method: 'POST',
        body: new URLSearchParams({
          client_id: config.appId,
          client_secret: config.appSecret,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code,
        }),
      });
      if (shortLived.status !== 200) throw instagramError(shortLived.status, shortLived.body);
      const shortToken = String(pick(shortLived.body, 'access_token') ?? '');

      const exchanged = await requestJson(
        fetchImpl,
        `${GRAPH}/access_token?${new URLSearchParams({
          grant_type: 'ig_exchange_token',
          client_secret: config.appSecret,
          access_token: shortToken,
        })}`,
      );
      if (exchanged.status !== 200) throw instagramError(exchanged.status, exchanged.body);
      const tokens = longLivedTokensFrom(exchanged.body, now);

      const me = await graphGet('me', {
        fields: 'user_id,username,name,account_type',
        access_token: tokens.accessToken,
      });
      if (!PROFESSIONAL_ACCOUNT_TYPES.has(String(pick(me, 'account_type')))) {
        throw new SocialProviderError('PERSONAL_ACCOUNT');
      }
      const account: PlatformAccount = {
        externalId: String(pick(me, 'user_id')),
        handle: String(pick(me, 'username')),
        displayName: String(pick(me, 'name') ?? pick(me, 'username')),
      };
      return { tokens, accounts: [account] };
    },

    async refreshTokens(tokens) {
      const response = await requestJson(
        fetchImpl,
        `${GRAPH}/refresh_access_token?${new URLSearchParams({
          grant_type: 'ig_refresh_token',
          access_token: tokens.accessToken,
        })}`,
      );
      if (response.status !== 200) throw instagramError(response.status, response.body);
      return longLivedTokensFrom(response.body, new Date());
    },

    async fetchStats({ externalId, accessToken, now }): Promise<AccountStats> {
      // Instagram has no public lookup; every linked account is a verified login.
      if (!accessToken) throw new SocialProviderError('TOKEN_REVOKED', 'no token');
      const profile = await graphGet(externalId, {
        fields: 'username,name,followers_count,media_count',
        access_token: accessToken,
      });
      const media = await graphGet(`${externalId}/media`, {
        fields: 'timestamp,like_count,comments_count',
        limit: String(SOCIAL_REFRESH.maxRecentPosts),
        access_token: accessToken,
      });
      const windowStart = recentWindowStart(now, SOCIAL_REFRESH.recentWindowDays);
      const items = pick(media, 'data');
      const recent = (Array.isArray(items) ? items : []).filter((item) => {
        const timestamp = pick(item, 'timestamp');
        return typeof timestamp === 'string' && new Date(timestamp) >= windowStart;
      });

      return {
        handle: String(pick(profile, 'username')),
        displayName: String(pick(profile, 'name') ?? pick(profile, 'username')),
        followers: toCount(pick(profile, 'followers_count')),
        isFollowerCountHidden: false,
        mediaCount: toCount(pick(profile, 'media_count')),
        posts30d: recent.length,
        views30d: null,
        likes30d: recent.reduce((sum, item) => sum + toCount(pick(item, 'like_count')), 0),
        comments30d: recent.reduce((sum, item) => sum + toCount(pick(item, 'comments_count')), 0),
        audience: await audienceBreakdown(externalId, accessToken),
      };
    },

    findPublicAccount: async () => null,

    parsePostUrl: parsePostShortcode,

    async fetchPostStats({ postId, accountExternalId, accessToken }) {
      if (!accessToken) throw new SocialProviderError('TOKEN_REVOKED', 'no token');
      // The Graph API has no lookup by link, so find the post among the account's own.
      const media = await graphGet(`${accountExternalId}/media`, {
        fields: 'id,permalink,like_count,comments_count',
        limit: String(MAX_MEDIA_LOOKUP),
        access_token: accessToken,
      });
      const items = pick(media, 'data');
      const post = (Array.isArray(items) ? items : []).find((item) =>
        String(pick(item, 'permalink') ?? '').includes(`/${postId}/`),
      );
      if (!post) return null;
      return {
        views: null,
        likes: toCount(pick(post, 'like_count')),
        comments: toCount(pick(post, 'comments_count')),
      };
    },
  };
}

/** The shortcode in an instagram.com post, reel or IGTV link; null for anything else. */
export function parsePostShortcode(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    // Not a URL.
    return null;
  }
  if (url.hostname.replace(/^www\./, '') !== 'instagram.com') return null;
  const [kind, code] = url.pathname.split('/').filter(Boolean);
  return kind && POST_PATH_KINDS.has(kind) && code && SHORTCODE_PATTERN.test(code) ? code : null;
}
