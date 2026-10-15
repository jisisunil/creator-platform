/** Creator profile and social-account tunables (FR-2, FR-3, UC-C). */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const PROFILE_LIMITS = {
  displayNameMax: 80,
  bioMax: 500,
  cityMax: 80,
  minCategories: 1,
  maxCategories: 3,
  minLanguages: 1,
  maxLanguages: 5,
  maxPortfolioItems: 20,
  portfolioBrandMax: 80,
  urlMax: 500,
  /** Largest rate-card price accepted, in rupees (₹1 crore). */
  maxRateRupees: 10_000_000,
} as const;

/** SR-9: profile photos. Images only; large photos are slow on 4G (NFR-6). */
export const PROFILE_PHOTO = {
  maxBytes: 2 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as readonly string[],
  /** Refuse decompression bombs: 40 megapixels is above any phone camera. */
  maxInputPixels: 40_000_000,
  /** Shown at most 96 CSS px; 320 px stays sharp on 3× phone screens. */
  outputSizePx: 320,
  outputQuality: 80,
  outputContentType: 'image/webp',
} as const;

/** Signed file URLs expire after this long (SR-9). */
export const SIGNED_FILE_URL_TTL_MS = HOUR_MS;

/** FR-3.4 / NFR-3: refresh daily; data must never be older than 48 hours. */
export const SOCIAL_REFRESH = {
  /** Daily fan-out, 02:00 India time. */
  schedule: '0 2 * * *',
  timezone: 'Asia/Kolkata',
  /** An account refreshed more recently than this is skipped by the daily run. */
  minIntervalMs: 20 * HOUR_MS,
  /** UC-C4: after a quota error, try again in the next window. */
  quotaRetryDelayMs: 6 * HOUR_MS,
  /** Temporary errors are retried by the queue with exponential back-off. */
  transientRetryLimit: 3,
  transientRetryDelaySeconds: 60,
  /** Posts from this many days back count towards the 30-day figures. */
  recentWindowDays: 30,
  /** Upper bound on recent posts fetched per refresh, to protect API quota. */
  maxRecentPosts: 50,
  /** Refresh an access token this long before it expires. */
  tokenRefreshMarginMs: 10 * MINUTE_MS,
  /** NFR-3: stats older than this break the promise; the daily health check alerts. */
  maxDataAgeMs: 48 * HOUR_MS,
} as const;

/** UC-C2: accounts from one login wait this long for the creator to pick one. */
export const PENDING_SOCIAL_CONNECTION_TTL_MS = 15 * MINUTE_MS;
