/**
 * One interface for every social platform (NFR-12, spec "International expansion"): a new
 * platform is a new class implementing this, registered in registry.ts. Callers never see
 * platform-specific details.
 */

export type SocialPlatform = 'YOUTUBE' | 'INSTAGRAM';

export interface ProviderTokens {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAt: Date | null;
}

/** A channel or account the platform says the login controls (or a public lookup found). */
export interface PlatformAccount {
  readonly externalId: string;
  readonly handle: string;
  readonly displayName: string;
}

export type AudienceDimension = 'AGE' | 'GENDER' | 'CITY';

export interface AudienceShare {
  readonly dimension: AudienceDimension;
  readonly bucket: string;
  /** Thousandths of the audience (1000 = 100%). */
  readonly sharePermille: number;
}

/** Statistics at fetch time; the 30-day figures cover posts published in the last 30 days. */
export interface AccountStats {
  readonly handle: string;
  readonly displayName: string;
  readonly followers: number;
  readonly isFollowerCountHidden: boolean;
  readonly mediaCount: number;
  readonly posts30d: number;
  /** Null where the platform doesn't give views without extra permissions. */
  readonly views30d: number | null;
  readonly likes30d: number;
  readonly comments30d: number;
  /** Aggregate audience demographics, or null when unavailable or not permitted (UC-C3). */
  readonly audience: readonly AudienceShare[] | null;
}

export type ProviderErrorKind =
  /** UC-C4: daily API quota used up; retry in the next window, keep old data. */
  | 'QUOTA_EXCEEDED'
  /** UC-C3/UC-C4: the creator revoked access or the token expired for good. */
  | 'TOKEN_REVOKED'
  /** UC-C4: the account no longer exists. */
  | 'ACCOUNT_NOT_FOUND'
  /** UC-C4: the account was made private. */
  | 'ACCOUNT_PRIVATE'
  /** UC-C3: an Instagram personal account; it must switch to Creator or Business. */
  | 'PERSONAL_ACCOUNT'
  /** Network failure, timeout or 5xx; retry with back-off. */
  | 'TRANSIENT'
  /** The request itself was wrong (bad code, bad id); retrying won't help. */
  | 'INVALID_REQUEST';

/** Expected failures from a platform, typed so callers handle each case (CLAUDE.md §6). */
export class SocialProviderError extends Error {
  override readonly name = 'SocialProviderError';

  constructor(
    readonly kind: ProviderErrorKind,
    detail?: string,
  ) {
    super(detail ? `${kind}: ${detail}` : kind);
  }
}

export interface SocialPlatformProvider {
  readonly platform: SocialPlatform;

  /** FR-3.1/3.2: the official login URL that proves ownership. */
  authorizationUrl(input: { state: string; redirectUri: string }): string;

  /** Exchanges the login code for tokens and the accounts that login controls. */
  completeAuthorization(input: {
    code: string;
    redirectUri: string;
  }): Promise<{ tokens: ProviderTokens; accounts: readonly PlatformAccount[] }>;

  /** Fresh tokens before the current ones expire. Throws TOKEN_REVOKED when that's impossible. */
  refreshTokens(tokens: ProviderTokens): Promise<ProviderTokens>;

  /** Current statistics. A null access token means public data only (unverified link). */
  fetchStats(input: {
    externalId: string;
    accessToken: string | null;
    now: Date;
  }): Promise<AccountStats>;

  /**
   * FR-3.1: find a public account by profile URL or id, for unverified links. Platforms
   * without public lookup (Instagram) return null.
   */
  findPublicAccount(urlOrId: string): Promise<PlatformAccount | null>;
}
