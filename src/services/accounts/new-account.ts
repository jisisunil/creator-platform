import type { Repositories } from '@/adapters/db/repositories';
import type { UserRecord } from '@/adapters/db/user-repository';
import { LAUNCH_COUNTRY_CODE } from '@/config/countries';
import type { SelfServiceRole } from '@/domain/accounts';
import { companyDomainOf } from '@/domain/email-address';
import { invalidState } from '@/domain/errors';
import { startingPlanFor } from '../plans';

export interface NewAccountDetails {
  readonly role: SelfServiceRole;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string | null;
  readonly locale: string;
  readonly acceptsMarketing: boolean;
  /** Set when the email is already proven (Google, invite link). */
  readonly emailVerifiedAt: Date | null;
  /** Required for brand sign-ups that create a new brand. */
  readonly brand?: { readonly name: string; readonly industry: string };
  /** For brand sign-ups from a team invite: join this brand as a member instead. */
  readonly joinBrandId?: string;
}

/**
 * Creates a user with their consent records (PRV-1: no consent, no account) and, for
 * brands, the brand with its starting plan. Call inside a transaction.
 */
export async function createAccount(
  repos: Repositories,
  now: Date,
  details: NewAccountDetails,
  ipAddress: string | null,
): Promise<UserRecord> {
  const country = await repos.reference.findCountry(LAUNCH_COUNTRY_CODE);
  if (!country?.isEnabled) throw invalidState();

  const user = await repos.users.create({
    email: details.email,
    passwordHash: details.passwordHash,
    name: details.name,
    role: details.role,
    status: details.emailVerifiedAt ? 'ACTIVE' : 'PENDING_VERIFICATION',
    emailVerifiedAt: details.emailVerifiedAt,
    countryCode: country.code,
    locale: details.locale,
  });

  await repos.consents.append(
    user.id,
    [
      { kind: 'AGE_CONFIRMATION', isGranted: true, noticeVersion: country.privacyNoticeVersion },
      { kind: 'PRIVACY_NOTICE', isGranted: true, noticeVersion: country.privacyNoticeVersion },
      {
        kind: 'MARKETING',
        isGranted: details.acceptsMarketing,
        noticeVersion: country.privacyNoticeVersion,
      },
    ],
    ipAddress,
  );

  if (details.role === 'BRAND' && details.joinBrandId) {
    await repos.brands.addMember(details.joinBrandId, user.id, 'MEMBER');
  } else if (details.role === 'BRAND') {
    if (!details.brand) throw invalidState();
    await createBrandForOwner(repos, now, user, details.brand);
  }
  return user;
}

/** A new brand with its owner, on its starting plan (UC-B1: free beta, trial, one per company). */
async function createBrandForOwner(
  repos: Repositories,
  now: Date,
  owner: UserRecord,
  brand: { readonly name: string; readonly industry: string },
): Promise<void> {
  const startingPlan = await startingPlanFor(repos, owner, now);
  await repos.brands.createWithOwner({
    name: brand.name,
    industry: brand.industry,
    countryCode: owner.countryCode,
    emailDomain: companyDomainOf(owner.email),
    planId: startingPlan.planId,
    planStartedAt: now,
    trialEndsAt: startingPlan.trialEndsAt,
    hasHadTrial: startingPlan.hasHadTrial,
    ownerUserId: owner.id,
  });
}
