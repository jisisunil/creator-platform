/** Plans module: trials, allowances, credit packs and plan changes (FR-11, UC-B1 to UC-B3). */
import type { BrandMembership } from '@/adapters/db/brand-repository';
import type { CreditPackRecord, PlanCode, PlanRecord } from '@/adapters/db/plan-repository';
import type { Repositories } from '@/adapters/db/repositories';
import type { UserRecord } from '@/adapters/db/user-repository';
import {
  CREDIT_PACKS,
  type CreditPackCode,
  MAX_TRIAL_EXTENSION_DAYS,
  TRIAL_ENDING_NOTICE_DAYS,
} from '@/config/plans';
import { PLATFORM_SETTING_DEFAULTS } from '@/config/platform-settings';
import { canonicalMailbox, companyDomainOf } from '@/domain/email-address';
import { invalidState, notFound, planLimitReached, validationFailed } from '@/domain/errors';
import {
  creditPackExpiry,
  isTrialOver,
  packToUse,
  trialNoticeDue,
  usableCredits,
} from '@/domain/plans';
import { contactPeriodStart, nextContactPeriodStart } from '@/domain/requests';
import { getLogger } from '@/lib/logger';
import type { ServiceContext } from '../context';
import { requireBrandMembership } from '../discovery';
import { requestEmailDispatch } from '../email';
import { notifyUsers } from '../notifications';
import { recordSecurityEvent, requireAdmin } from '../security';

export type { CreditPackRecord, PlanCode, PlanRecord } from '@/adapters/db/plan-repository';

const DAY_MS = 86_400_000;
const TRIAL_NOTICES_PER_RUN = 500;
const logger = getLogger('plans');

/** What the brand can still send this period (FR-7.3, FR-11.1). */
export type ContactAllowance =
  /** UC-D1: search stays open, contacting is blocked until the plan changes. */
  | { readonly kind: 'TRIAL_ENDED'; readonly trialEndedAt: Date }
  | {
      readonly kind: 'PERIOD';
      readonly used: number;
      readonly limit: number;
      readonly remaining: number;
      /** Null for a trial: its allowance doesn't renew. */
      readonly renewsAt: Date | null;
    }
  | { readonly kind: 'CREDITS'; readonly remaining: number };

/** FR-11.1: the brand's contact allowance right now. */
export async function contactAllowance(
  repos: Repositories,
  membership: BrandMembership,
  now: Date,
): Promise<ContactAllowance> {
  if (membership.trialEndsAt && isTrialOver(membership.trialEndsAt, now)) {
    return { kind: 'TRIAL_ENDED', trialEndedAt: membership.trialEndsAt };
  }
  if (membership.plan.usesCreditPacks) {
    const packs = await repos.plans.listCreditPacks(membership.brandId);
    return { kind: 'CREDITS', remaining: usableCredits(packs, now) };
  }
  const { billingPeriod, contactRequestsPerPeriod: limit } = membership.plan;
  const used = await repos.requests.countSentSince(
    membership.brandId,
    contactPeriodStart(billingPeriod, membership.planStartedAt, now),
  );
  return {
    kind: 'PERIOD',
    used,
    limit,
    remaining: Math.max(0, limit - used),
    renewsAt: nextContactPeriodStart(billingPeriod, membership.planStartedAt, now),
  };
}

/**
 * UC-B2: uses one contact request from the allowance, or throws PLAN_LIMIT_REACHED with the
 * reason. Call inside the transaction that saves the request, after locking the brand row,
 * so a limit reached mid-action leaves nothing half-saved. Returns the pack a pay-as-you-go
 * credit came from.
 */
export async function useContactRequest(
  repos: Repositories,
  membership: BrandMembership,
  now: Date,
): Promise<{ creditPackId: string | null }> {
  const allowance = await contactAllowance(repos, membership, now);
  if (allowance.kind === 'TRIAL_ENDED') throw planLimitReached('trialEnded');
  if (allowance.kind === 'PERIOD') {
    if (allowance.remaining === 0) throw planLimitReached('requestsUsed');
    return { creditPackId: null };
  }
  const pack = packToUse(await repos.plans.listCreditPacks(membership.brandId), now);
  if (!pack || !(await repos.plans.useCredit(pack.id))) throw planLimitReached('noCredits');
  return { creditPackId: pack.id };
}

export interface StartingPlan {
  readonly planId: string;
  readonly trialEndsAt: Date | null;
  readonly hasHadTrial: boolean;
}

/**
 * UC-B1: a new brand starts on the free beta while it runs, otherwise on a trial. Only one
 * trial per company: a company email domain that already had one, or an owner whose mailbox
 * already owns a brand (e.g. "+tags", Gmail dots), gets a trial that has already ended.
 * Admins can extend it (FR-11.3). Call inside the sign-up transaction.
 */
export async function startingPlanFor(
  repos: Repositories,
  owner: Pick<UserRecord, 'id' | 'email' | 'countryCode'>,
  now: Date,
): Promise<StartingPlan> {
  const isFreeBetaActive = await repos.reference.getBooleanSetting(
    'isFreeBetaActive',
    PLATFORM_SETTING_DEFAULTS.isFreeBetaActive,
  );
  const plan = await repos.plans.findPlan(
    isFreeBetaActive ? 'FREE_BETA' : 'TRIAL',
    owner.countryCode,
  );
  if (!plan) throw invalidState();
  if (plan.trialDays === null) return { planId: plan.id, trialEndsAt: null, hasHadTrial: false };

  const domain = companyDomainOf(owner.email);
  const isRepeatDomain = domain !== null && (await repos.plans.hasCompanyHadTrial(domain));
  const isRepeatMailbox = await repos.users.hasOtherBrandOwnerWithMailbox(
    canonicalMailbox(owner.email),
    owner.id,
  );
  if (isRepeatDomain || isRepeatMailbox) {
    await recordSecurityEvent(repos, {
      action: 'trial.repeat-detected',
      actorUserId: owner.id,
      metadata: { byDomain: isRepeatDomain, byMailbox: isRepeatMailbox },
    });
    return { planId: plan.id, trialEndsAt: now, hasHadTrial: false };
  }
  return {
    planId: plan.id,
    trialEndsAt: new Date(now.getTime() + plan.trialDays * DAY_MS),
    hasHadTrial: true,
  };
}

export interface PlanOverview {
  readonly brandName: string;
  readonly isOwner: boolean;
  readonly plan: PlanRecord;
  readonly trialEndsAt: Date | null;
  readonly allowance: ContactAllowance;
  readonly seats: { readonly used: number; readonly limit: number };
  readonly shortlists: { readonly used: number; readonly limit: number };
  readonly creditPacks: readonly CreditPackRecord[];
  /** FR-11.2: the plans a brand can move to, cheapest first. */
  readonly upgradeOptions: readonly PlanRecord[];
  readonly creditPackOptions: typeof CREDIT_PACKS;
}

/** FR-11.1 / FR-11.2: the brand's plan, what it has used and what it could move to. */
export async function getPlanOverview(ctx: ServiceContext, userId: string): Promise<PlanOverview> {
  const membership = await requireBrandMembership(ctx.repos, userId);
  const now = ctx.clock.now();
  const plans = await ctx.repos.plans.listPlans(membership.countryCode);
  const plan = plans.find((candidate) => candidate.code === membership.plan.code);
  if (!plan) throw invalidState();
  const [members, pendingInvites, shortlists, creditPacks] = await Promise.all([
    ctx.repos.brands.countMembers(membership.brandId),
    ctx.repos.brands.countPendingInvites(membership.brandId, now),
    ctx.repos.shortlists.countForBrand(membership.brandId),
    ctx.repos.plans.listCreditPacks(membership.brandId),
  ]);
  return {
    brandName: membership.brandName,
    isOwner: membership.role === 'OWNER',
    plan,
    trialEndsAt: membership.trialEndsAt,
    allowance: await contactAllowance(ctx.repos, membership, now),
    seats: { used: members + pendingInvites, limit: plan.seatLimit },
    shortlists: { used: shortlists, limit: plan.shortlistLimit },
    creditPacks,
    upgradeOptions: plans.filter(
      (option) =>
        option.code !== 'FREE_BETA' && option.code !== 'TRIAL' && option.code !== plan.code,
    ),
    creditPackOptions: CREDIT_PACKS,
  };
}

async function requireBrand(repos: Repositories, brandId: string) {
  const brand = await repos.plans.findBrand(brandId);
  if (!brand) throw notFound();
  return brand;
}

/**
 * FR-11.3 / UC-B3: an admin moves a brand to another plan; a new period starts now. A
 * trial gets its full length. Downgrades keep existing team members and shortlists; new
 * invites and lists are blocked until they fit. Audited.
 */
export async function changeBrandPlan(
  ctx: ServiceContext,
  input: { readonly adminUserId: string; readonly brandId: string; readonly planCode: PlanCode },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const brand = await requireBrand(ctx.repos, input.brandId);
  const plan = await ctx.repos.plans.findPlan(input.planCode, brand.countryCode);
  if (!plan) throw validationFailed({ planCode: 'validation.invalidChoice' });
  const now = ctx.clock.now();
  await ctx.transaction(async (repos) => {
    await repos.plans.setBrandPlan(brand.id, {
      planId: plan.id,
      planStartedAt: now,
      trialEndsAt:
        plan.trialDays === null ? null : new Date(now.getTime() + plan.trialDays * DAY_MS),
    });
    await repos.audit.record({
      category: 'ADMIN',
      action: 'plan.changed',
      actorUserId: input.adminUserId,
      metadata: { brandId: brand.id, from: brand.planCode, to: plan.code },
    });
  });
}

/** FR-11.3: an admin extends a trial (from its end, or from now if it already ended). Audited. */
export async function extendTrial(
  ctx: ServiceContext,
  input: { readonly adminUserId: string; readonly brandId: string; readonly days: number },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > MAX_TRIAL_EXTENSION_DAYS) {
    throw validationFailed({ days: 'plan.invalidExtension' });
  }
  const brand = await requireBrand(ctx.repos, input.brandId);
  if (brand.planCode !== 'TRIAL') throw invalidState();
  const now = ctx.clock.now();
  const from = brand.trialEndsAt && !isTrialOver(brand.trialEndsAt, now) ? brand.trialEndsAt : now;
  await ctx.transaction(async (repos) => {
    await repos.plans.setTrialEndsAt(brand.id, new Date(from.getTime() + input.days * DAY_MS));
    await repos.audit.record({
      category: 'ADMIN',
      action: 'trial.extended',
      actorUserId: input.adminUserId,
      metadata: { brandId: brand.id, days: input.days },
    });
  });
}

/**
 * Pay-as-you-go: an admin adds a credit pack after payment (online payment is later,
 * FR-11.4). Credits are valid for 90 days. Audited.
 */
export async function addCreditPack(
  ctx: ServiceContext,
  input: {
    readonly adminUserId: string;
    readonly brandId: string;
    readonly packCode: CreditPackCode;
  },
): Promise<void> {
  await requireAdmin(ctx.repos, input.adminUserId);
  const brand = await requireBrand(ctx.repos, input.brandId);
  const pack = CREDIT_PACKS.find((option) => option.code === input.packCode);
  if (!pack) throw validationFailed({ packCode: 'validation.invalidChoice' });
  const now = ctx.clock.now();
  await ctx.transaction(async (repos) => {
    await repos.plans.addCreditPack({
      brandId: brand.id,
      credits: pack.credits,
      priceMinor: pack.priceMinor,
      currencyCode: pack.currencyCode,
      expiresAt: creditPackExpiry(now, pack.validDays),
      addedByUserId: input.adminUserId,
      createdAt: now,
    });
    await repos.audit.record({
      category: 'ADMIN',
      action: 'credits.added',
      actorUserId: input.adminUserId,
      metadata: { brandId: brand.id, pack: pack.code },
    });
  });
}

/**
 * UC-B1 / UC-D1: daily job. Tells brand teams their trial ends in 3 days, and again when it
 * has ended (search stays open; contacting needs a plan).
 */
export async function sendTrialReminders(
  deps: Pick<ServiceContext, 'repos' | 'transaction' | 'clock' | 'jobQueue' | 'appUrl'>,
): Promise<{ ending: number; ended: number }> {
  const now = deps.clock.now();
  const candidates = await deps.repos.plans.trialNoticeCandidates(
    new Date(now.getTime() + TRIAL_ENDING_NOTICE_DAYS * DAY_MS),
    TRIAL_NOTICES_PER_RUN,
  );
  const counts = { ending: 0, ended: 0 };
  for (const brand of candidates) {
    const notice = trialNoticeDue(brand, now, TRIAL_ENDING_NOTICE_DAYS);
    if (!notice) continue;
    await deps.transaction(async (repos) => {
      await repos.plans.markTrialNotice(brand.brandId, notice, now);
      await notifyUsers(repos, deps.appUrl, {
        now,
        userIds: await repos.brands.activeMemberIds(brand.brandId),
        path: '/brand/plan',
        email: (recipient) =>
          notice === 'ENDING'
            ? { template: 'trialEnding', payload: { ...recipient, brandName: brand.brandName } }
            : { template: 'trialEnded', payload: { ...recipient, brandName: brand.brandName } },
      });
    });
    counts[notice === 'ENDING' ? 'ending' : 'ended'] += 1;
  }
  if (counts.ending + counts.ended > 0) await requestEmailDispatch(deps.jobQueue);
  logger.info({ action: 'trial.reminders', ...counts }, 'trial reminders sent');
  return counts;
}
