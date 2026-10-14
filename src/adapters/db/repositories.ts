import { createAuditRepository } from './audit-repository';
import { createAuthAccountRepository } from './auth-account-repository';
import { createBrandRepository } from './brand-repository';
import { createConsentRepository } from './consent-repository';
import { createCreatorRepository } from './creator-repository';
import { createDiscoveryRepository } from './discovery-repository';
import type { DbClient } from './db-client';
import { createEmailOutboxRepository } from './email-outbox-repository';
import { createHealthRepository } from './health-repository';
import { createOneTimeTokenRepository } from './one-time-token-repository';
import { createRateLimitRepository } from './rate-limit-repository';
import { createReferenceRepository } from './reference-repository';
import { createScoreRepository } from './score-repository';
import { createSearchRepository } from './search-repository';
import { createSessionRepository } from './session-repository';
import { createShortlistRepository } from './shortlist-repository';
import { createSocialAccountRepository } from './social-account-repository';
import { createUserRepository } from './user-repository';

/** Every repository, bound to one client (the root client or a transaction). */
export function createRepositories(db: DbClient) {
  return {
    users: createUserRepository(db),
    sessions: createSessionRepository(db),
    oneTimeTokens: createOneTimeTokenRepository(db),
    authAccounts: createAuthAccountRepository(db),
    consents: createConsentRepository(db),
    reference: createReferenceRepository(db),
    audit: createAuditRepository(db),
    rateLimits: createRateLimitRepository(db),
    emailOutbox: createEmailOutboxRepository(db),
    brands: createBrandRepository(db),
    health: createHealthRepository(db),
    creators: createCreatorRepository(db),
    socialAccounts: createSocialAccountRepository(db),
    scores: createScoreRepository(db),
    search: createSearchRepository(db),
    shortlists: createShortlistRepository(db),
    discovery: createDiscoveryRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
