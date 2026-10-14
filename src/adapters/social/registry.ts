import { createInstagramProvider } from './instagram-provider';
import { createMockProvider } from './mock-provider';
import type { SocialPlatform, SocialPlatformProvider } from './provider';
import { createYouTubeProvider } from './youtube-provider';

/** The provider for each platform. */
export type SocialProviderRegistry = Readonly<Record<SocialPlatform, SocialPlatformProvider>>;

export interface SocialProviderSettings {
  readonly mode: 'mock' | 'live';
  readonly appUrl: string;
  readonly youtube?: { apiKey: string; clientId: string; clientSecret: string };
  readonly instagram?: { appId: string; appSecret: string };
}

/**
 * Picks live or mock providers. Env validation guarantees the keys exist in live mode and
 * that production never runs on mocks.
 */
export function createSocialProviderRegistry(
  settings: SocialProviderSettings,
): SocialProviderRegistry {
  if (settings.mode === 'mock' || !settings.youtube || !settings.instagram) {
    return {
      YOUTUBE: createMockProvider('YOUTUBE', settings.appUrl),
      INSTAGRAM: createMockProvider('INSTAGRAM', settings.appUrl),
    };
  }
  return {
    YOUTUBE: createYouTubeProvider(settings.youtube),
    INSTAGRAM: createInstagramProvider(settings.instagram),
  };
}
