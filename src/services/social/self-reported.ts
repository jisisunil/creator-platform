import type { SocialPlatform } from '@/adapters/social/provider';
import { SELF_REPORTED_MAX_FOLLOWERS, SELF_REPORTED_PLATFORMS } from '@/config/creators';
import { notAllowed, validationFailed } from '@/domain/errors';
import { parseInstagramHandle } from '@/domain/social-handles';
import type { ServiceContext } from '../context';
import { recomputeCreatorScore } from '../scoring';
import { recordSecurityEvent } from '../security';

/**
 * Q-17 / Q-43: lets an Instagram-first creator join while the official Instagram login is
 * unavailable (Meta's app review). The handle is shown as "self-reported, not verified" with
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
  if (!SELF_REPORTED_PLATFORMS.includes(input.platform)) throw notAllowed();
  const username = parseInstagramHandle(input.handle);
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
