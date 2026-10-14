/**
 * Notifications module: tells users about collaboration, account and plan events, in the
 * app and by email, as each user prefers (FR-12.1, FR-12.2). Security emails (sign-in,
 * password, email change) don't come through here, so they can never be turned off.
 */
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationRecord,
} from '@/adapters/db/notification-repository';
import type { Repositories } from '@/adapters/db/repositories';
import type { EmailTemplates } from '@/adapters/email/templates';
import { NOTIFICATION_PAGE_SIZE } from '@/config/notifications';
import type { UserRole } from '@/domain/accounts';
import type { ServiceContext } from '../context';
import { queueEmail } from '../email';

export type {
  NotificationCategory,
  NotificationChannel,
  NotificationRecord,
} from '@/adapters/db/notification-repository';

/** Which preference category each notification belongs to (FR-12.2). */
const CATEGORY_OF = {
  requestReceived: 'REQUESTS',
  requestAccepted: 'REQUESTS',
  requestDeclined: 'REQUESTS',
  newMessage: 'MESSAGES',
  dealTermsUpdated: 'DEALS',
  dealContentSubmitted: 'DEALS',
  dealPostAdded: 'DEALS',
  dealCancelled: 'DEALS',
  paymentMarked: 'DEALS',
  paymentDisputed: 'DEALS',
  dealDeadlinePassed: 'DEALS',
  paymentOverdue: 'DEALS',
  ratingRequested: 'RATINGS',
  socialRefreshFailed: 'ACCOUNT',
  trialEnding: 'PLAN',
  trialEnded: 'PLAN',
} as const satisfies Partial<Record<keyof EmailTemplates, NotificationCategory>>;

export type NotificationKind = keyof typeof CATEGORY_OF;

/** Every notification kind; each needs an in-app text under `notifications.kinds`. */
export const NOTIFICATION_KINDS = Object.keys(CATEGORY_OF) as readonly NotificationKind[];

/** True for kinds this version knows how to show (older or newer rows are skipped). */
export function isNotificationKind(kind: string): kind is NotificationKind {
  return Object.hasOwn(CATEGORY_OF, kind);
}

export type NotificationEmail = {
  [Name in NotificationKind]: { readonly template: Name; readonly payload: EmailTemplates[Name] };
}[NotificationKind];

/** The categories a role can receive, in the order the settings page lists them. */
export const CATEGORIES_BY_ROLE: Readonly<
  Record<'CREATOR' | 'BRAND', readonly NotificationCategory[]>
> = {
  CREATOR: ['REQUESTS', 'MESSAGES', 'DEALS', 'RATINGS', 'ACCOUNT'],
  BRAND: ['REQUESTS', 'MESSAGES', 'DEALS', 'RATINGS', 'PLAN'],
};

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ['IN_APP', 'EMAIL'];

/** Who a notification is for: their name, and the event's link in their language. */
export interface Recipient {
  readonly name: string;
  readonly link: string;
}

/**
 * Notifies each active recipient in their language, in the app and by email unless they
 * turned that category off. The email builder gives the event's details; the in-app notice
 * keeps the same details. Call inside the transaction that caused the event, then
 * `requestEmailDispatch` after it commits. Suspended or missing users are skipped.
 */
export async function notifyUsers(
  repos: Repositories,
  appUrl: string,
  notice: {
    readonly userIds: readonly string[];
    /** Without the locale, e.g. "/deals/abc". */
    readonly path: string;
    readonly email: (recipient: Recipient) => NotificationEmail;
    /** The time to stamp on the in-app notice. */
    readonly now: Date;
  },
): Promise<void> {
  for (const userId of new Set(notice.userIds)) {
    const user = await repos.users.findById(userId);
    if (!user || user.status !== 'ACTIVE') continue;
    const email = notice.email({
      name: user.name,
      link: new URL(`/${user.locale}${notice.path}`, appUrl).toString(),
    });
    const category = CATEGORY_OF[email.template];
    const turnedOff = new Set(
      (await repos.notifications.listPreferences(user.id))
        .filter((preference) => preference.category === category && !preference.isEnabled)
        .map((preference) => preference.channel),
    );
    if (!turnedOff.has('IN_APP')) {
      const { name: _name, link: _link, ...params } = email.payload;
      await repos.notifications.create({
        userId: user.id,
        category,
        kind: email.template,
        params,
        path: notice.path,
        createdAt: notice.now,
      });
    }
    if (!turnedOff.has('EMAIL')) {
      await queueEmail(repos, {
        userId: user.id,
        toAddress: user.email,
        locale: user.locale,
        ...email,
      });
    }
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

export interface NotificationPage {
  readonly items: readonly NotificationRecord[];
  readonly page: number;
  readonly pageCount: number;
}

/**
 * FR-12.1: the user's notifications, newest first. Opening the first page marks them all
 * read; the page still shows which ones were new.
 */
export async function listNotifications(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly page: number },
): Promise<NotificationPage> {
  const page = Math.max(1, Math.floor(input.page));
  const result = await ctx.repos.notifications.list(input.userId, {
    offset: (page - 1) * NOTIFICATION_PAGE_SIZE,
    limit: NOTIFICATION_PAGE_SIZE,
  });
  if (page === 1) await ctx.repos.notifications.markAllRead(input.userId, ctx.clock.now());
  return {
    items: result.items,
    page,
    pageCount: Math.max(1, Math.ceil(result.total / NOTIFICATION_PAGE_SIZE)),
  };
}

/** FR-12.1: unread notifications (navigation badge). */
export function countUnreadNotifications(ctx: ServiceContext, userId: string): Promise<number> {
  return ctx.repos.notifications.countUnread(userId);
}

export interface PreferenceSetting {
  readonly category: NotificationCategory;
  readonly channel: NotificationChannel;
  readonly isEnabled: boolean;
}

function categoriesFor(role: UserRole): readonly NotificationCategory[] {
  return role === 'CREATOR' || role === 'BRAND' ? CATEGORIES_BY_ROLE[role] : [];
}

/** FR-12.2: the user's settings for every category their role receives (on unless turned off). */
export async function getNotificationPreferences(
  ctx: ServiceContext,
  user: { readonly id: string; readonly role: UserRole },
): Promise<PreferenceSetting[]> {
  const saved = await ctx.repos.notifications.listPreferences(user.id);
  return categoriesFor(user.role).flatMap((category) =>
    NOTIFICATION_CHANNELS.map((channel) => ({
      category,
      channel,
      isEnabled:
        saved.find((row) => row.category === category && row.channel === channel)?.isEnabled ??
        true,
    })),
  );
}

/**
 * FR-12.2: saves the user's choices. `enabled` lists "CATEGORY:CHANNEL" pairs left on;
 * everything else the role receives is turned off. Unknown pairs are ignored.
 */
export async function saveNotificationPreferences(
  ctx: ServiceContext,
  input: { readonly userId: string; readonly role: UserRole; readonly enabled: readonly string[] },
): Promise<void> {
  const enabled = new Set(input.enabled);
  await ctx.transaction(async (repos) => {
    for (const category of categoriesFor(input.role)) {
      for (const channel of NOTIFICATION_CHANNELS) {
        await repos.notifications.setPreference(input.userId, {
          category,
          channel,
          isEnabled: enabled.has(`${category}:${channel}`),
        });
      }
    }
  });
}
