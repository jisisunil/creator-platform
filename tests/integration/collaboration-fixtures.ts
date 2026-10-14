import type { DatabaseClient } from '@/adapters/db/client';
import { type RequestInput, respondToRequest, sendRequest } from '@/services/requests';
import { createBrandOwner, createSearchableCreator } from './discovery-fixtures';
import type { TestContext } from './test-context';

/** A valid request; the deadline is a month after the test clock's start (2026-10-09). */
export function requestInput(overrides: Partial<RequestInput> = {}): RequestInput {
  return {
    campaignName: 'Diwali 2026',
    brief: 'Two reels about our festive sweets box, warm family tone, Tamil voice-over.',
    deliverables: [{ deliverable: 'REEL', quantity: 2 }],
    budgetRupees: 25_000,
    deadline: '2026-11-15',
    usageRights: 'BRAND_ORGANIC',
    ...overrides,
  };
}

export interface PartyOptions {
  readonly brandEmail?: string;
  readonly creatorEmail?: string;
  readonly brandPlan?: 'FREE_BETA' | 'TRIAL' | 'STARTER' | 'PRO';
}

/** The creator's YouTube account id in collaboration tests; mock post links use it. */
export const CREATOR_CHANNEL_ID = 'mock-yt-asha-cooks';

/** A brand owner and a searchable creator, ready for requests. */
export async function createBrandAndCreator(
  ctx: TestContext,
  db: DatabaseClient,
  options: PartyOptions = {},
) {
  const brand = await createBrandOwner(
    ctx,
    db,
    options.brandEmail ?? 'owner@spiceco.in',
    options.brandPlan,
  );
  const creator = await createSearchableCreator(ctx, db, {
    email: options.creatorEmail ?? 'creator@example.in',
    displayName: 'Asha Cooks',
    externalId: options.creatorEmail ? undefined : CREATOR_CHANNEL_ID,
  });
  const creatorUser = await db.user.findUniqueOrThrow({
    where: { email: options.creatorEmail ?? 'creator@example.in' },
  });
  return { brand, creator, creatorUser };
}

/** Sends a request from the brand user to the creator. */
export function sendTestRequest(
  ctx: TestContext,
  brandUserId: string,
  creatorId: string,
  overrides: Partial<RequestInput> = {},
): Promise<string> {
  return sendRequest(ctx, { ...requestInput(overrides), userId: brandUserId, creatorId });
}

/** Sends a request and has the creator accept it; returns the request id. */
export async function acceptedRequest(
  ctx: TestContext,
  db: DatabaseClient,
  options: PartyOptions = {},
) {
  const parties = await createBrandAndCreator(ctx, db, options);
  const requestId = await sendTestRequest(ctx, parties.brand.id, parties.creator.creatorId);
  await respondToRequest(ctx, {
    userId: parties.creatorUser.id,
    requestId,
    version: 1,
    decision: 'accept',
  });
  return { ...parties, requestId };
}
