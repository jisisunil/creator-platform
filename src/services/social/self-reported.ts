import type { SocialPlatform } from '@/adapters/social/provider';
import { SELF_REPORTED_MAX_FOLLOWERS, SELF_REPORTED_PLATFORMS } from '@/config/creators';
import { notAllowed, validationFailed } from '@/domain/errors';
import { SELF_REPORT_HANDLES } from '@/domain/social-handles';
import type { ServiceContext } from '../context';
import { recomputeCreatorScore } from '../scoring';
import { recordSecurityEvent } from '../security';

/**
 * Q-43: whether creators may list this platform by hand: always for the platforms in
 * SELF_REPORTED_PLATFORMS, and for any platform whose official login is switched off.
 */
export function canSelfReport(
  ctx: Pick<ServiceContext, 'socialProviders'>,
  platform: SocialPlatform,
) {
  return (
    SELF_REPORTED_PLATFORMS.includes(platform) ||
    !ctx.socialProviders[platform].isOfficialLoginAvailable
  );
}

/** Whether the platform's official login can be offered (false in SOCIAL_PROVIDER_MODE=off). */
export function isOfficialLoginAvailable(
  ctx: Pick<ServiceContext, 'socialProviders'>,
  platform: SocialPlatform,
): boolean {
  return ctx.socialProviders[platform].isOfficialLoginAvailable;
}

/**
 * Q-17 / Q-43: lets a creator join while the platform's official login is unavailable
 * (Meta's app review, or a pilot without Google/Meta apps). The handle is shown as "self-reported, not verified" with
 * a link for brands to check; it makes the creator findable but feeds nothing measured: no
 * score, tier, follower filters or campaign stats. Errors: NOT_ALLOWED when the platform
 * doesn't allow it; VALIDATION_ERROR for a bad handle, a creator who already has an account
 * on the platform, or a handle another creator already listed.
 */
export async function addSelfReportedAccount(
  ctx: ServiceContext,
  input: {
    userId: string;
    platform: SocialPlatform;
    handle: string;
    declaredFollowers: number | null;
  },
): Promise<{ accountId: string }> {
  if (!canSelfReport(ctx, input.platform)) throw notAllowed();
  const username = SELF_REPORT_HANDLES[input.platform].parse(input.handle);
  if (!username) throw validationFailed({ handle: 'social.handleInvalid' });
  const followers = input.declaredFollowers;
  if (followers !== null && (followers < 0 || followers > SELF_REPORTED_MAX_FOLLOWERS)) {
    throw validationFailed({ declaredFollowers: 'validation.outOfRange' });
  }

  const { accountId, creatorId } = await ctx.transaction(async (repos) => {
    const profile = await repos.creators.findByUserId(input.userId);
    if (!profile) throw notAllowed();
    if (profile.accounts.some((account) => account.platform === input.platform)) {
      throw validationFailed({ handle: 'social.alreadyHasAccount' });
    }
    // One listing per handle, so nobody can self-report a handle someone else already has.
    if ((await repos.socialAccounts.findByHandle(input.platform, username)).length > 0) {
      throw validationFailed({ handle: 'social.handleAlreadyListed' });
    }
    const id = await repos.socialAccounts.create({
      creatorId: profile.id,
      platform: input.platform,
      externalId: `self-reported:${username}`,
      handle: `@${username}`,
      displayName: `@${username}`,
      isVerified: false,
      verifiedAt: null,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      isSelfReported: true,
      selfReportedFollowers: followers,
    });
    await recordSecurityEvent(repos, {
      action: 'social.self-reported',
      actorUserId: input.userId,
      metadata: { platform: input.platform },
    });
    return { accountId: id, creatorId: profile.id };
  });
  await recomputeCreatorScore(ctx, creatorId);
  return { accountId };
}
