/** Reports module: users report the other side of a chat to the moderators (FR-8.3, SEC-6, SEC-7). */
import { otherSide } from '@/domain/chat';
import { getLogger } from '@/lib/logger';
import { requireThreadAccess } from '../chat';
import type { ServiceContext } from '../context';
import { consumeRateLimit } from '../security';

const logger = getLogger('reports');

/**
 * FR-8.3: reports the other party of a chat to the admin queue (handled in phase g). A
 * second report about the same party while one is still open is not duplicated.
 * Rate-limited per user.
 */
export async function reportChatPartner(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly threadId: string; readonly reason: string },
): Promise<void> {
  await consumeRateLimit(ctx.repos, ctx.clock.now(), 'reportsPerUser', input.userId);
  const { thread, side } = await requireThreadAccess(ctx.repos, input.userId, input.threadId);
  const targetType = otherSide(side);
  const targetId = targetType === 'CREATOR' ? thread.creatorId : thread.brandId;
  if (await ctx.repos.reports.hasOpenReport(input.userId, targetType, targetId)) return;
  await ctx.repos.reports.create({
    reporterUserId: input.userId,
    targetType,
    targetId,
    threadId: thread.id,
    reason: input.reason,
  });
  logger.info({ action: 'report.filed', targetType }, 'user reported');
}
