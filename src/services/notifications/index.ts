/**
 * Notifications module: tells users about collaboration events (FR-12.1). Today it queues
 * emails through the outbox; phase f adds in-app notifications and preferences here, so
 * callers don't change.
 */
import type { Repositories } from '@/adapters/db/repositories';
import type { EmailTemplates } from '@/adapters/email/templates';
import { queueEmail } from '../email';

/** Emails about collaboration events. */
export type CollaborationTemplate =
  | 'requestReceived'
  | 'requestAccepted'
  | 'requestDeclined'
  | 'dealCancelled'
  | 'paymentMarked'
  | 'dealDeadlinePassed'
  | 'paymentOverdue'
  | 'ratingRequested';

export type NotificationEmail = {
  [Name in CollaborationTemplate]: {
    readonly template: Name;
    readonly payload: EmailTemplates[Name];
  };
}[CollaborationTemplate];

/** Who an email is for: their name, and the event's link in their language. */
export interface Recipient {
  readonly name: string;
  readonly link: string;
}

/**
 * Queues one email per active recipient, in their language, linking to `path` (e.g.
 * "/creator/requests/abc"). Call inside the transaction that caused the event, then
 * `requestEmailDispatch` after it commits. Suspended or missing users are skipped.
 */
export async function notifyUsers(
  repos: Repositories,
  appUrl: string,
  notice: {
    readonly userIds: readonly string[];
    readonly path: string;
    readonly email: (recipient: Recipient) => NotificationEmail;
  },
): Promise<void> {
  for (const userId of new Set(notice.userIds)) {
    const user = await repos.users.findById(userId);
    if (!user || user.status !== 'ACTIVE') continue;
    const link = new URL(`/${user.locale}${notice.path}`, appUrl).toString();
    await queueEmail(repos, {
      userId: user.id,
      toAddress: user.email,
      locale: user.locale,
      ...notice.email({ name: user.name, link }),
    });
  }
}

/**
 * Who on a brand's team hears about a collaboration: the member who sent the request if
 * they are still active on the team, otherwise the owner (or the longest-standing member).
 */
export async function brandContactIds(
  repos: Repositories,
  brandId: string,
  preferredUserId: string | null,
): Promise<string[]> {
  const memberIds = await repos.brands.activeMemberIds(brandId);
  if (preferredUserId && memberIds.includes(preferredUserId)) return [preferredUserId];
  return memberIds.slice(0, 1);
}
