import type { SocialPlatform, SocialPlatformProvider } from './provider';

/**
 * Stands in for a platform whose official login is switched off (SOCIAL_PROVIDER_MODE=off).
 * Nothing can be connected or fetched; creators list the platform as self-reported instead
 * (Q-43). The connect buttons are hidden, so these calls mean a bug or a forged request.
 */
export function createUnavailableProvider(platform: SocialPlatform): SocialPlatformProvider {
  const refuse = (): never => {
    throw new Error(`The official ${platform} login is switched off`);
  };
  return {
    platform,
    isOfficialLoginAvailable: false,
    authorizationUrl: refuse,
    completeAuthorization: async () => refuse(),
    refreshTokens: async () => refuse(),
    fetchStats: async () => refuse(),
    findPublicAccount: async () => null,
    parsePostUrl: () => null,
    fetchPostStats: async () => null,
  };
}
