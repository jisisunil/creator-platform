import { SOCIAL_REFRESH } from '@/config/creators';
import { pick, recentWindowStart, requestJson, toCount } from './http';
import {
  type AccountStats,
  type PlatformAccount,
  type ProviderTokens,
  type SocialPlatformProvider,
  SocialProviderError,
} from './provider';

const API = 'https://www.googleapis.com/youtube/v3';
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
// Least privilege (SR-6): read-only access, enough to prove ownership and read statistics.
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const MAX_IDS_PER_REQUEST = 50;
const CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/;
const VIDEO_ID_PATTERN = /^[\w-]{11}$/;

export interface YouTubeConfig {
  readonly apiKey: string;
  readonly clientId: string;
  readonly clientSecret: string;
}

/** Turns a YouTube API error response into a typed provider error. */
function youtubeError(status: number, body: unknown): SocialProviderError {
  const reason = String(pick(body, 'error', 'errors', 0, 'reason') ?? pick(body, 'error') ?? '');
  if (status === 403 && /quota|rateLimit/i.test(reason)) {
    return new SocialProviderError('QUOTA_EXCEEDED', reason);
  }
  if (status === 401 || reason === 'invalid_grant') {
    return new SocialProviderError('TOKEN_REVOKED', reason);
  }
  if (status === 404) return new SocialProviderError('ACCOUNT_NOT_FOUND', reason);
  return new SocialProviderError('INVALID_REQUEST', `${status} ${reason}`);
}

function tokensFrom(body: unknown, now: Date, previousRefresh: string | null): ProviderTokens {
  const accessToken = pick(body, 'access_token');
  if (typeof accessToken !== 'string') throw new SocialProviderError('INVALID_REQUEST', 'no token');
  const expiresIn = toCount(pick(body, 'expires_in'));
  const refreshToken = pick(body, 'refresh_token');
  return {
    accessToken,
    refreshToken: typeof refreshToken === 'string' ? refreshToken : previousRefresh,
    expiresAt: expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null,
  };
}

function accountFrom(item: unknown): PlatformAccount {
  const customUrl = String(pick(item, 'snippet', 'customUrl') ?? '');
  return {
    externalId: String(pick(item, 'id')),
    handle: customUrl || String(pick(item, 'id')),
    displayName: String(pick(item, 'snippet', 'title') ?? ''),
  };
}

/**
 * YouTube via the official Data API v3 (no scraping). Public statistics use the API key;
 * ownership is proved with Google sign-in and the read-only YouTube scope (FR-3.1).
 */
export function createYouTubeProvider(
  config: YouTubeConfig,
  fetchImpl: typeof fetch = fetch,
): SocialPlatformProvider {
  async function get(path: string, params: Record<string, string>, accessToken: string | null) {
    const url = new URL(`${API}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    if (!accessToken) url.searchParams.set('key', config.apiKey);
    const response = await requestJson(fetchImpl, url.toString(), {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (response.status !== 200) throw youtubeError(response.status, response.body);
    return response.body;
  }

  async function postToken(
    form: Record<string, string>,
    now: Date,
    previousRefresh: string | null,
  ) {
    const response = await requestJson(fetchImpl, TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams(form),
    });
    if (response.status !== 200) throw youtubeError(response.status, response.body);
    return tokensFrom(response.body, now, previousRefresh);
  }

  return {
    platform: 'YOUTUBE',

    authorizationUrl({ state, redirectUri }) {
      const url = new URL(AUTHORIZE_URL);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        state,
      }).toString();
      return url.toString();
    },

    async completeAuthorization({ code, redirectUri }) {
      const tokens = await postToken(
        {
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        },
        new Date(),
        null,
      );
      // UC-C2: one Google account can own several channels; the creator picks one.
      const body = await get('channels', { part: 'snippet', mine: 'true' }, tokens.accessToken);
      const items = pick(body, 'items');
      const accounts = Array.isArray(items) ? items.map(accountFrom) : [];
      return { tokens, accounts };
    },

    async refreshTokens(tokens) {
      if (!tokens.refreshToken) throw new SocialProviderError('TOKEN_REVOKED', 'no refresh token');
      return postToken(
        {
          refresh_token: tokens.refreshToken,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: 'refresh_token',
        },
        new Date(),
        tokens.refreshToken,
      );
    },

    async fetchStats({ externalId, accessToken, now }): Promise<AccountStats> {
      const channelBody = await get(
        'channels',
        { part: 'snippet,statistics,contentDetails', id: externalId },
        accessToken,
      );
      const channel = pick(channelBody, 'items', 0);
      if (!channel) throw new SocialProviderError('ACCOUNT_NOT_FOUND', externalId);

      const uploadsPlaylist = pick(channel, 'contentDetails', 'relatedPlaylists', 'uploads');
      const windowStart = recentWindowStart(now, SOCIAL_REFRESH.recentWindowDays);
      let recentVideoIds: string[] = [];
      if (typeof uploadsPlaylist === 'string') {
        const playlistBody = await get(
          'playlistItems',
          {
            part: 'contentDetails',
            playlistId: uploadsPlaylist,
            maxResults: String(Math.min(SOCIAL_REFRESH.maxRecentPosts, MAX_IDS_PER_REQUEST)),
          },
          accessToken,
        );
        const items = pick(playlistBody, 'items');
        recentVideoIds = (Array.isArray(items) ? items : [])
          .filter((item) => {
            const published = pick(item, 'contentDetails', 'videoPublishedAt');
            return typeof published === 'string' && new Date(published) >= windowStart;
          })
          .map((item) => String(pick(item, 'contentDetails', 'videoId')));
      }

      let views30d = 0;
      let likes30d = 0;
      let comments30d = 0;
      if (recentVideoIds.length > 0) {
        const videosBody = await get(
          'videos',
          { part: 'statistics', id: recentVideoIds.join(',') },
          accessToken,
        );
        const videos = pick(videosBody, 'items');
        for (const video of Array.isArray(videos) ? videos : []) {
          views30d += toCount(pick(video, 'statistics', 'viewCount'));
          likes30d += toCount(pick(video, 'statistics', 'likeCount'));
          comments30d += toCount(pick(video, 'statistics', 'commentCount'));
        }
      }

      const isHidden = pick(channel, 'statistics', 'hiddenSubscriberCount') === true;
      const account = accountFrom(channel);
      return {
        handle: account.handle,
        displayName: account.displayName,
        followers: isHidden ? 0 : toCount(pick(channel, 'statistics', 'subscriberCount')),
        isFollowerCountHidden: isHidden,
        mediaCount: toCount(pick(channel, 'statistics', 'videoCount')),
        posts30d: recentVideoIds.length,
        views30d,
        likes30d,
        comments30d,
        // Demographics need the YouTube Analytics scope; the spec asks for them on Instagram only.
        audience: null,
      };
    },

    parsePostUrl: parseVideoUrl,

    async fetchPostStats({ postId, accountExternalId, accessToken }) {
      const body = await get(
        'videos',
        { part: 'snippet,statistics,status', id: postId },
        accessToken,
      );
      const video = pick(body, 'items', 0);
      // Missing (deleted, or private and we can't see it) or on another channel.
      if (!video || pick(video, 'snippet', 'channelId') !== accountExternalId) return null;
      if (pick(video, 'status', 'privacyStatus') === 'private') {
        throw new SocialProviderError('ACCOUNT_PRIVATE', 'video is private');
      }
      return {
        views: toCount(pick(video, 'statistics', 'viewCount')),
        likes: toCount(pick(video, 'statistics', 'likeCount')),
        comments: toCount(pick(video, 'statistics', 'commentCount')),
      };
    },

    async findPublicAccount(urlOrId) {
      const query = parseChannelReference(urlOrId);
      if (!query) return null;
      const body = await get('channels', { part: 'snippet', ...query }, null);
      const channel = pick(body, 'items', 0);
      return channel ? accountFrom(channel) : null;
    },
  };
}

/** Channel id or @handle from a channel URL, a bare id or a bare handle. */
export function parseChannelReference(
  input: string,
): { id: string } | { forHandle: string } | null {
  const trimmed = input.trim();
  if (CHANNEL_ID_PATTERN.test(trimmed)) return { id: trimmed };
  if (/^@[\w.-]{3,100}$/.test(trimmed)) return { forHandle: trimmed };
  let url: URL;
  try {
    url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    // Not a URL, id or handle.
    return null;
  }
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
  const [first, second] = url.pathname.split('/').filter(Boolean);
  if (first === 'channel' && second && CHANNEL_ID_PATTERN.test(second)) return { id: second };
  if (first?.startsWith('@')) return { forHandle: first };
  return null;
}

/** The video id in a watch, short, live or youtu.be link; null for anything else. */
export function parseVideoUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    // Not a URL.
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, '');
  const segments = url.pathname.split('/').filter(Boolean);
  let id: string | null | undefined = null;
  if (host === 'youtu.be') id = segments[0];
  else if (host === 'youtube.com' && segments[0] === 'watch') id = url.searchParams.get('v');
  else if (host === 'youtube.com' && (segments[0] === 'shorts' || segments[0] === 'live')) {
    id = segments[1];
  }
  return id && VIDEO_ID_PATTERN.test(id) ? id : null;
}
