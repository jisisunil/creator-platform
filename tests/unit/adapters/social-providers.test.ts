import { describe, expect, it, vi } from 'vitest';
import { createInstagramProvider } from '@/adapters/social/instagram-provider';
import { createMockProvider, mockStatsFor } from '@/adapters/social/mock-provider';
import { createYouTubeProvider, parseChannelReference } from '@/adapters/social/youtube-provider';

const now = new Date('2026-10-13T10:00:00Z');
const recent = '2026-10-01T10:00:00Z';
const old = '2026-08-01T10:00:00Z';

/** A fake fetch that answers by URL substring, in order of the routes given. */
function fakeFetch(routes: readonly [string, number, unknown][]) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const route = routes.find(([fragment]) => url.includes(fragment));
    if (!route) throw new Error(`unexpected request ${url}`);
    const [, status, body] = route;
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

const youtubeConfig = { apiKey: 'key', clientId: 'client', clientSecret: 'secret' };

describe('YouTube provider (FR-3.1, UC-C2, UC-C4)', () => {
  it('sums the last 30 days of uploads from the official API', async () => {
    const provider = createYouTubeProvider(
      youtubeConfig,
      fakeFetch([
        [
          '/channels?',
          200,
          {
            items: [
              {
                id: 'UCaaaaaaaaaaaaaaaaaaaaaa',
                snippet: { title: 'Asha', customUrl: '@asha' },
                statistics: { subscriberCount: '52000', videoCount: '310' },
                contentDetails: { relatedPlaylists: { uploads: 'UUaaa' } },
              },
            ],
          },
        ],
        [
          '/playlistItems?',
          200,
          {
            items: [
              { contentDetails: { videoId: 'v1', videoPublishedAt: recent } },
              { contentDetails: { videoId: 'v2', videoPublishedAt: recent } },
              { contentDetails: { videoId: 'v3', videoPublishedAt: old } },
            ],
          },
        ],
        [
          '/videos?',
          200,
          {
            items: [
              { statistics: { viewCount: '1000', likeCount: '100', commentCount: '10' } },
              { statistics: { viewCount: '3000', likeCount: '300', commentCount: '30' } },
            ],
          },
        ],
      ]),
    );

    const stats = await provider.fetchStats({
      externalId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
      accessToken: null,
      now,
    });

    expect(stats).toMatchObject({
      handle: '@asha',
      followers: 52_000,
      mediaCount: 310,
      posts30d: 2,
      views30d: 4000,
      likes30d: 400,
      comments30d: 40,
      audience: null,
    });
  });

  it('UC-C2 reports hidden subscriber counts instead of guessing', async () => {
    const provider = createYouTubeProvider(
      youtubeConfig,
      fakeFetch([
        [
          '/channels?',
          200,
          {
            items: [
              {
                id: 'UCx',
                snippet: {},
                statistics: { hiddenSubscriberCount: true },
                contentDetails: {},
              },
            ],
          },
        ],
      ]),
    );

    const stats = await provider.fetchStats({ externalId: 'UCx', accessToken: null, now });

    expect(stats).toMatchObject({ followers: 0, isFollowerCountHidden: true, posts30d: 0 });
  });

  it('UC-C4 maps quota, revoked and missing-channel responses to typed errors', async () => {
    const quota = createYouTubeProvider(
      youtubeConfig,
      fakeFetch([['/channels?', 403, { error: { errors: [{ reason: 'quotaExceeded' }] } }]]),
    );
    const revoked = createYouTubeProvider(youtubeConfig, fakeFetch([['/channels?', 401, {}]]));
    const missing = createYouTubeProvider(
      youtubeConfig,
      fakeFetch([['/channels?', 200, { items: [] }]]),
    );

    await expect(
      quota.fetchStats({ externalId: 'UCx', accessToken: null, now }),
    ).rejects.toMatchObject({ kind: 'QUOTA_EXCEEDED' });
    await expect(
      revoked.fetchStats({ externalId: 'UCx', accessToken: 't', now }),
    ).rejects.toMatchObject({ kind: 'TOKEN_REVOKED' });
    await expect(
      missing.fetchStats({ externalId: 'UCx', accessToken: null, now }),
    ).rejects.toMatchObject({ kind: 'ACCOUNT_NOT_FOUND' });
  });

  it('asks only for read-only access and offline refresh', () => {
    const url = new URL(
      createYouTubeProvider(youtubeConfig).authorizationUrl({
        state: 's',
        redirectUri: 'https://app/cb',
      }),
    );

    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/youtube.readonly');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('state')).toBe('s');
  });

  it('parses channel links, ids and handles, and ignores other sites', () => {
    expect(
      parseChannelReference('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv'),
    ).toEqual({
      id: 'UCabcdefghijklmnopqrstuv',
    });
    expect(parseChannelReference('youtube.com/@asha.cooks')).toEqual({ forHandle: '@asha.cooks' });
    expect(parseChannelReference('@asha')).toEqual({ forHandle: '@asha' });
    expect(parseChannelReference('https://evil.example/@asha')).toBeNull();
  });
});

describe('Instagram provider (FR-3.2, UC-C3)', () => {
  const config = { appId: 'app', appSecret: 'secret' };

  it('UC-C3 refuses personal accounts', async () => {
    const provider = createInstagramProvider(
      config,
      fakeFetch([
        ['api.instagram.com/oauth/access_token', 200, { access_token: 'short', user_id: 1 }],
        ['/access_token?', 200, { access_token: 'long', expires_in: 5_184_000 }],
        ['/me?', 200, { user_id: '17841', username: 'asha', account_type: 'PERSONAL' }],
      ]),
    );

    await expect(
      provider.completeAuthorization({ code: 'c', redirectUri: 'https://app/cb' }),
    ).rejects.toMatchObject({
      kind: 'PERSONAL_ACCOUNT',
    });
  });

  it('reads followers, recent media and audience shares in permille', async () => {
    const provider = createInstagramProvider(
      config,
      fakeFetch([
        [
          '/insights?',
          200,
          {
            data: [
              {
                total_value: {
                  breakdowns: [
                    {
                      results: [
                        { dimension_values: ['F'], value: 600 },
                        { dimension_values: ['M'], value: 400 },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
        [
          '/media?',
          200,
          {
            data: [
              { timestamp: recent, like_count: 500, comments_count: 20 },
              { timestamp: old, like_count: 900, comments_count: 90 },
            ],
          },
        ],
        [
          '/17841?',
          200,
          { username: 'asha', name: 'Asha', followers_count: 25_000, media_count: 140 },
        ],
      ]),
    );

    const stats = await provider.fetchStats({ externalId: '17841', accessToken: 'token', now });

    expect(stats).toMatchObject({
      followers: 25_000,
      posts30d: 1,
      likes30d: 500,
      comments30d: 20,
      views30d: null,
    });
    expect(stats.audience).toContainEqual({ dimension: 'GENDER', bucket: 'F', sharePermille: 600 });
  });

  it('UC-C3 treats missing insights permission as "audience not shared"', async () => {
    const provider = createInstagramProvider(
      config,
      fakeFetch([
        ['/insights?', 400, { error: { code: 10, message: 'permission' } }],
        ['/media?', 200, { data: [] }],
        ['/17841?', 200, { username: 'asha', followers_count: 25_000, media_count: 140 }],
      ]),
    );

    const stats = await provider.fetchStats({ externalId: '17841', accessToken: 'token', now });

    expect(stats.audience).toBeNull();
  });

  it('UC-C4 maps an expired token to TOKEN_REVOKED', async () => {
    const provider = createInstagramProvider(
      config,
      fakeFetch([['/17841?', 400, { error: { code: 190, message: 'expired' } }]]),
    );

    await expect(
      provider.fetchStats({ externalId: '17841', accessToken: 'token', now }),
    ).rejects.toMatchObject({
      kind: 'TOKEN_REVOKED',
    });
  });
});

describe('mock provider', () => {
  it('is deterministic and covers every tier', () => {
    expect(mockStatsFor('YOUTUBE', 'mock-yt-a', now)).toEqual(
      mockStatsFor('YOUTUBE', 'mock-yt-a', now),
    );
    const followers = Array.from(
      { length: 200 },
      (_, index) => mockStatsFor('INSTAGRAM', `mock-ig-${index}`, now).followers,
    );
    expect(Math.min(...followers)).toBeLessThan(10_000);
    expect(Math.max(...followers)).toBeGreaterThan(500_000);
  });

  it('simulates failures from the account id', async () => {
    const provider = createMockProvider('YOUTUBE', 'https://app.test');

    await expect(
      provider.fetchStats({ externalId: 'mock-yt-quota1', accessToken: null, now }),
    ).rejects.toMatchObject({
      kind: 'QUOTA_EXCEEDED',
    });
  });
});
