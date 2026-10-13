/** Consent module: privacy notice acceptance and marketing consent (PR-2..PR-4, PRV-1/5/8). */
import type { ConsentEntry } from '@/adapters/db/consent-repository';
import { needsPrivacyReconsent } from '@/domain/consent';
import { notFound } from '@/domain/errors';
import type { RequestInfo, ServiceContext } from '../context';
import { recordSecurityEvent } from '../security';

export interface ConsentStatus {
  readonly currentNoticeVersion: string;
  /** PRV-8: the user must agree to the current notice before continuing. */
  readonly needsReconsent: boolean;
  readonly hasMarketingConsent: boolean;
}

async function currentNoticeVersionFor(ctx: ServiceContext, countryCode: string) {
  const country = await ctx.repos.reference.findCountry(countryCode);
  if (!country) throw notFound();
  return country.privacyNoticeVersion;
}

/** Where a user stands on the privacy notice and marketing consent. */
export async function getConsentStatus(
  ctx: ServiceContext,
  user: { readonly id: string; readonly countryCode: string },
): Promise<ConsentStatus> {
  const [currentNoticeVersion, notices, acceptedVersion, marketing] = await Promise.all([
    currentNoticeVersionFor(ctx, user.countryCode),
    ctx.repos.reference.listPrivacyNotices(user.countryCode),
    ctx.repos.consents.latestAcceptedNoticeVersion(user.id),
    ctx.repos.consents.latest(user.id, 'MARKETING'),
  ]);
  return {
    currentNoticeVersion,
    needsReconsent: needsPrivacyReconsent(acceptedVersion, notices),
    hasMarketingConsent: marketing?.isGranted ?? false,
  };
}

/** PRV-8: records agreement to the current privacy notice. */
export async function acceptCurrentPrivacyNotice(
  ctx: ServiceContext,
  user: { readonly id: string; readonly countryCode: string },
  request: RequestInfo,
): Promise<void> {
  const version = await currentNoticeVersionFor(ctx, user.countryCode);
  await ctx.transaction(async (repos) => {
    await repos.consents.append(
      user.id,
      [{ kind: 'PRIVACY_NOTICE', isGranted: true, noticeVersion: version }],
      request.ipAddress,
    );
    await recordSecurityEvent(repos, {
      action: 'consent.privacy-accepted',
      actorUserId: user.id,
      subjectUserId: user.id,
      ipAddress: request.ipAddress,
      metadata: { version },
    });
  });
}

/** PR-4 / PRV-5: turns marketing consent on or off; withdrawing is as easy as giving. */
export async function setMarketingConsent(
  ctx: ServiceContext,
  user: { readonly id: string; readonly countryCode: string },
  isGranted: boolean,
  request: RequestInfo,
): Promise<void> {
  const version = await currentNoticeVersionFor(ctx, user.countryCode);
  await ctx.transaction(async (repos) => {
    await repos.consents.append(
      user.id,
      [{ kind: 'MARKETING', isGranted, noticeVersion: version }],
      request.ipAddress,
    );
    await recordSecurityEvent(repos, {
      action: isGranted ? 'consent.marketing-granted' : 'consent.marketing-withdrawn',
      actorUserId: user.id,
      subjectUserId: user.id,
      ipAddress: request.ipAddress,
    });
  });
}

/** PR-3: the user's own consent history, newest first. */
export async function getConsentHistory(
  ctx: ServiceContext,
  userId: string,
): Promise<ConsentEntry[]> {
  return ctx.repos.consents.history(userId);
}
