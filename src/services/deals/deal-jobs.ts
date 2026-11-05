/** Deals module daily jobs: deadline and payment reminders, post stats (UC-R4 to UC-R6). */
import { SocialProviderError } from '@/adapters/social/provider';
import { DEAL_LIMITS, POST_STATS_REFRESH } from '@/config/collaboration';
import { isDeadlineReminderDue, isPaymentReminderDue } from '@/domain/deals';
import { getLogger } from '@/lib/logger';
import type { ServiceContext } from '../context';
import { requestEmailDispatch } from '../email';
import { brandContactIds, notifyUsers } from '../notifications';
import { fetchPostStatsFor } from '../social';

const DAY_MS = 86_400_000;
const logger = getLogger('deals');

/**
 * UC-R4 / UC-R5: daily job. Past-deadline deals with nothing posted remind both sides
 * once; overdue payments remind the brand every week until marked paid.
 */
export async function sendDealReminders(
  deps: Pick<ServiceContext, 'repos' | 'transaction' | 'clock' | 'jobQueue' | 'appUrl'>,
): Promise<{ deadlineReminders: number; paymentReminders: number }> {
  const now = deps.clock.now();
  const postedBefore = new Date(now.getTime() - DEAL_LIMITS.paymentGraceDays * DAY_MS);
  const deals = await deps.repos.deals.remindableDeals(
    now,
    postedBefore,
    DEAL_LIMITS.remindersPerRun,
  );
  const days = {
    graceDays: DEAL_LIMITS.paymentGraceDays,
    repeatDays: DEAL_LIMITS.paymentReminderRepeatDays,
  };
  let deadlineReminders = 0;
  let paymentReminders = 0;
  for (const deal of deals) {
    if (isDeadlineReminderDue(deal, now)) {
      await deps.transaction(async (repos) => {
        await repos.deals.markReminderSent(deal.id, 'deadlineReminderSentAt', now);
        await repos.deals.addEvent({
          dealId: deal.id,
          kind: 'DEADLINE_REMINDER',
          actorUserId: null,
          actorSide: null,
          createdAt: now,
        });
        await notifyUsers(repos, deps.appUrl, {
          now,
          userIds: [
            deal.creatorUserId,
            ...(await brandContactIds(repos, deal.brandId, deal.sentByUserId)),
          ],
          path: `/deals/${deal.id}`,
          email: (recipient) => ({
            template: 'dealDeadlinePassed',
            payload: { ...recipient, campaignName: deal.campaignName },
          }),
        });
      });
      deadlineReminders += 1;
    } else if (isPaymentReminderDue(deal, now, days)) {
      await deps.transaction(async (repos) => {
        await repos.deals.markReminderSent(deal.id, 'paymentReminderSentAt', now);
        await repos.deals.addEvent({
          dealId: deal.id,
          kind: 'PAYMENT_REMINDER',
          actorUserId: null,
          actorSide: null,
          createdAt: now,
        });
        await notifyUsers(repos, deps.appUrl, {
          now,
          userIds: await brandContactIds(repos, deal.brandId, deal.sentByUserId),
          path: `/deals/${deal.id}`,
          email: (recipient) => ({
            template: 'paymentOverdue',
            payload: {
              ...recipient,
              creatorName: deal.creatorDisplayName,
              campaignName: deal.campaignName,
            },
          }),
        });
      });
      paymentReminders += 1;
    }
  }
  if (deadlineReminders + paymentReminders > 0) await requestEmailDispatch(deps.jobQueue);
  return { deadlineReminders, paymentReminders };
}

/**
 * UC-R6: daily job refreshing post stats for 90 days after posting. Deleted or private
 * posts keep their last stats and are marked; temporary failures retry tomorrow.
 */
export async function refreshDealPosts(
  ctx: ServiceContext,
): Promise<{ refreshed: number; deleted: number; private: number; failed: number }> {
  const now = ctx.clock.now();
  const posts = await ctx.repos.deals.postsDueForRefresh(
    new Date(now.getTime() - POST_STATS_REFRESH.staleAfterMs),
    new Date(now.getTime() - POST_STATS_REFRESH.refreshForDays * DAY_MS),
    POST_STATS_REFRESH.postsPerRun,
  );
  const counts = { refreshed: 0, deleted: 0, private: 0, failed: 0 };
  for (const post of posts) {
    if (!post.socialAccountId) {
      counts.failed += 1;
      continue;
    }
    try {
      const stats = await fetchPostStatsFor(ctx, {
        socialAccountId: post.socialAccountId,
        postId: post.externalPostId,
      });
      if (stats) {
        await ctx.repos.deals.updatePost(post.id, {
          status: 'LIVE',
          ...stats,
          statsFetchedAt: now,
        });
        counts.refreshed += 1;
      } else {
        await ctx.repos.deals.updatePost(post.id, { status: 'DELETED', statsFetchedAt: now });
        counts.deleted += 1;
      }
    } catch (error) {
      if (error instanceof SocialProviderError && error.kind === 'ACCOUNT_PRIVATE') {
        await ctx.repos.deals.updatePost(post.id, { status: 'PRIVATE', statsFetchedAt: now });
        counts.private += 1;
      } else {
        logger.warn({ err: error, postId: post.id }, 'post stats refresh failed');
        counts.failed += 1;
      }
    }
  }
  return counts;
}
