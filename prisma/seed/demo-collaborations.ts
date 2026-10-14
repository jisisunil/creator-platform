import { systemClock } from '@/adapters/clock';
import { createArgon2PasswordHasher } from '@/adapters/crypto/password-hasher';
import { createAesGcmTokenCipher } from '@/adapters/crypto/token-cipher';
import { createTotpService } from '@/adapters/crypto/totp';
import type { DatabaseClient } from '@/adapters/db/client';
import { createRepositories } from '@/adapters/db/repositories';
import { createTransactionRunner } from '@/adapters/db/transaction';
import { disabledMalwareScanner } from '@/adapters/scan/malware-scanner';
import { createOfflineBreachedPasswordChecker } from '@/adapters/security/breached-password-checker';
import { disabledCaptchaVerifier } from '@/adapters/security/captcha-verifier';
import { createSocialProviderRegistry } from '@/adapters/social/registry';
import { createLocalFileStorage } from '@/adapters/storage/file-storage';
import { sendMessage } from '@/services/chat';
import type { ServiceContext } from '@/services/context';
import {
  addPostLink,
  confirmPaymentReceived,
  markDealPaid,
  updateDealTerms,
} from '@/services/deals';
import { submitRating } from '@/services/ratings';
import { getRequest, type RequestInput, respondToRequest, sendRequest } from '@/services/requests';
import { DEMO_ACCOUNTS } from './demo-accounts';

const DAY_MS = 86_400_000;

/** A date `days` from now as "YYYY-MM-DD". */
function dateInDays(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

function demoRequest(campaignName: string, brief: string): RequestInput {
  return {
    campaignName,
    brief: `${brief} (Demo request, not a real brand.)`,
    deliverables: [
      { deliverable: 'REEL', quantity: 2 },
      { deliverable: 'STORY', quantity: 3 },
    ],
    budgetRupees: 25_000,
    deadline: dateInDays(30),
    usageRights: 'BRAND_ORGANIC',
  };
}

/**
 * Demo collaborations for brand-owner@example.test, made through the real services so
 * they follow the same rules: one completed and rated deal (with a campaign report), one
 * deal in progress with a chat, and one request waiting for an answer. Development only.
 */
export async function seedDemoCollaborations(
  db: DatabaseClient,
  settings: { tokenEncryptionKey: string; fileStorageDir: string; appUrl: string },
): Promise<boolean> {
  const repos = createRepositories(db);
  const brandOwner = await repos.users.findByEmail(DEMO_ACCOUNTS.brandOwner);
  const membership = brandOwner ? await repos.brands.findMembership(brandOwner.id) : null;
  if (!brandOwner || !membership) return false;
  if ((await repos.requests.listCampaignNames(membership.brandId)).length > 0) return false;

  const ctx: ServiceContext = {
    repos,
    transaction: createTransactionRunner(db),
    clock: systemClock,
    passwordHasher: createArgon2PasswordHasher(),
    breachedPasswords: createOfflineBreachedPasswordChecker(),
    captcha: disabledCaptchaVerifier,
    tokenCipher: createAesGcmTokenCipher(settings.tokenEncryptionKey),
    totp: createTotpService(),
    // The running worker sends queued emails on its own schedule.
    jobQueue: { enqueue: async () => undefined },
    socialProviders: createSocialProviderRegistry({ mode: 'mock', appUrl: settings.appUrl }),
    fileStorage: createLocalFileStorage(settings.fileStorageDir),
    malwareScanner: disabledMalwareScanner,
    appUrl: settings.appUrl,
  };
  const creatorUser = async (index: string) => {
    const user = await repos.users.findByEmail(`demo-creator-${index}@example.test`);
    const profile = user ? await repos.creators.findByUserId(user.id) : null;
    if (!user || !profile) throw new Error(`demo creator ${index} missing; seed creators first`);
    return { userId: user.id, creatorId: profile.id };
  };
  const brandUserId = brandOwner.id;

  // 1. Completed, paid and rated by both sides (demo creator 03 has a YouTube channel).
  const completed = await creatorUser('03');
  const firstId = await sendRequest(ctx, {
    ...demoRequest('Diwali sweets 2026', 'Two reels showing our festive sweets box.'),
    userId: brandUserId,
    creatorId: completed.creatorId,
  });
  await respondToRequest(ctx, {
    userId: completed.userId,
    requestId: firstId,
    version: 1,
    decision: 'accept',
  });
  const firstDealId = (await getRequest(ctx, { userId: brandUserId, requestId: firstId })).dealId;
  if (!firstDealId) throw new Error('accepting should start a deal');
  await updateDealTerms(ctx, {
    userId: brandUserId,
    dealId: firstDealId,
    agreedAmountRupees: 30_000,
    advancePercent: 30,
    paymentDueOn: null,
  });
  await addPostLink(ctx, {
    userId: completed.userId,
    dealId: firstDealId,
    url: 'https://mock.social/mock-yt-seed-03/diwali-sweets-reel',
  });
  await markDealPaid(ctx, { userId: brandUserId, dealId: firstDealId });
  await confirmPaymentReceived(ctx, { userId: completed.userId, dealId: firstDealId });
  await submitRating(ctx, {
    userId: brandUserId,
    dealId: firstDealId,
    scores: { contentQuality: 5, onTime: 4, communication: 5 },
    comment: 'Great storytelling and quick replies. (Demo rating)',
  });
  await submitRating(ctx, {
    userId: completed.userId,
    dealId: firstDealId,
    scores: { clearBrief: 4, paidOnTime: 5, communication: 4 },
    comment: 'Clear brief and paid on time. (Demo rating)',
  });

  // 2. Accepted and being discussed in the chat (demo creator 06).
  const inProgress = await creatorUser('06');
  const secondId = await sendRequest(ctx, {
    ...demoRequest('Diwali sweets 2026', 'A reel and stories about gifting sweets to family.'),
    userId: brandUserId,
    creatorId: inProgress.creatorId,
  });
  await respondToRequest(ctx, {
    userId: inProgress.userId,
    requestId: secondId,
    version: 1,
    decision: 'accept',
  });
  const chatId = (await getRequest(ctx, { userId: brandUserId, requestId: secondId })).chatId;
  if (chatId) {
    await sendMessage(ctx, {
      userId: brandUserId,
      threadId: chatId,
      body: 'Thanks for accepting! Could you share a rough script by Friday?',
      attachment: null,
    });
    await sendMessage(ctx, {
      userId: inProgress.userId,
      threadId: chatId,
      body: 'Happy to. I will share the first draft here.',
      attachment: null,
    });
  }

  // 3. Waiting for an answer (demo creator 12).
  const waiting = await creatorUser('12');
  await sendRequest(ctx, {
    ...demoRequest('Winter skincare', 'One video reviewing our winter moisturiser.'),
    userId: brandUserId,
    creatorId: waiting.creatorId,
  });
  return true;
}
