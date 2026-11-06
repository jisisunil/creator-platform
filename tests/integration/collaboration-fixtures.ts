import type { DatabaseClient } from '@/adapters/db/client';
import { acceptContract, approveWork, getDeal, issueContract, submitWork } from '@/services/deals';
import { getRequest, type RequestInput, respondToRequest, sendRequest } from '@/services/requests';
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

/** An accepted request and its deal. */
export async function openDeal(ctx: TestContext, db: DatabaseClient, options: PartyOptions = {}) {
  const parties = await acceptedRequest(ctx, db, options);
  const view = await getRequest(ctx, { userId: parties.brand.id, requestId: parties.requestId });
  if (!view.dealId) throw new Error('accepting should start a deal');
  return { ...parties, dealId: view.dealId };
}

/** ADR-012: the brand issues the standard contract and the creator accepts it. */
export async function signContract(
  ctx: TestContext,
  parties: { brand: { id: string }; creatorUser: { id: string }; dealId: string },
  terms: {
    amountRupees?: number;
    advancePercent?: number | null;
    paymentDueOn?: string | null;
  } = {},
): Promise<string> {
  await issueContract(ctx, {
    userId: parties.brand.id,
    dealId: parties.dealId,
    amountRupees: terms.amountRupees ?? 25_000,
    advancePercent: terms.advancePercent ?? null,
    paymentDueOn: terms.paymentDueOn ?? null,
    additionalTerms: '',
    source: 'GENERATED',
    file: null,
  });
  const { contract } = await getDeal(ctx, {
    userId: parties.creatorUser.id,
    dealId: parties.dealId,
  });
  if (!contract.fingerprint) throw new Error('issuing should create a contract');
  await acceptContract(ctx, {
    userId: parties.creatorUser.id,
    dealId: parties.dealId,
    fingerprint: contract.fingerprint,
  });
  return contract.fingerprint;
}

/** ADR-012: contract signed, work submitted and approved, so payment is due. */
export async function deliverApprovedWork(
  ctx: TestContext,
  parties: { brand: { id: string }; creatorUser: { id: string }; dealId: string },
): Promise<void> {
  await signContract(ctx, parties);
  await submitWork(ctx, {
    userId: parties.creatorUser.id,
    dealId: parties.dealId,
    note: '',
    links: [`https://mock.social/${CREATOR_CHANNEL_ID}/reel`],
    files: [],
  });
  await approveWork(ctx, { userId: parties.brand.id, dealId: parties.dealId });
}
