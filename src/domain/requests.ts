/** Collaboration request rules (FR-7, UC-R1, UC-R2). Pure: no I/O. */

const DAY_MS = 86_400_000;

export type CollabRequestStatus = 'OPEN' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'WITHDRAWN';

export const DELIVERABLES = ['REEL', 'STORY', 'VIDEO', 'POST'] as const;
export type Deliverable = (typeof DELIVERABLES)[number];

/** FR-7.1: what the brand may do with the content. */
export const USAGE_RIGHTS = ['CREATOR_CHANNELS_ONLY', 'BRAND_ORGANIC', 'BRAND_PAID_ADS'] as const;
export type UsageRights = (typeof USAGE_RIGHTS)[number];

/** What the creator is asked to make: a quantity of one deliverable type. */
export interface DeliverableLine {
  readonly deliverable: Deliverable;
  readonly quantity: number;
}

export type BillingPeriod = 'NONE' | 'MONTHLY';

/** FR-7.2: when a request sent at `sentAt` expires. */
export function requestExpiresAt(sentAt: Date, expiryDays: number): Date {
  return new Date(sentAt.getTime() + expiryDays * DAY_MS);
}

/** FR-7.2: an open request past its expiry can no longer be answered or edited. */
export function isRequestExpired(request: { readonly expiresAt: Date }, now: Date): boolean {
  return request.expiresAt.getTime() <= now.getTime();
}

/**
 * The status to show: an open request past its expiry is shown as expired even before the
 * hourly expiry job has updated it.
 */
export function effectiveRequestStatus(
  request: { readonly status: CollabRequestStatus; readonly expiresAt: Date },
  now: Date,
): CollabRequestStatus {
  return request.status === 'OPEN' && isRequestExpired(request, now) ? 'EXPIRED' : request.status;
}

/** FR-7.3: the key that allows only one open request per brand and creator. */
export function openPairKey(brandId: string, creatorId: string): string {
  return `${brandId}:${creatorId}`;
}

function addMonthsClamped(date: Date, months: number): Date {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/**
 * FR-7.3 / FR-11.1: start of the period whose sent requests count against the plan.
 * Monthly plans renew on the plan start's day of the month (the 31st becomes the month's
 * last day); plans without a period (trial) count everything since the plan started.
 */
export function contactPeriodStart(
  billingPeriod: BillingPeriod,
  planStartedAt: Date,
  now: Date,
): Date {
  if (billingPeriod === 'NONE') return planStartedAt;
  const months =
    (now.getUTCFullYear() - planStartedAt.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - planStartedAt.getUTCMonth());
  const candidate = addMonthsClamped(planStartedAt, months);
  return candidate.getTime() > now.getTime()
    ? addMonthsClamped(planStartedAt, months - 1)
    : candidate;
}

/** FR-11.1: when a monthly allowance renews; null for plans without a period. */
export function nextContactPeriodStart(
  billingPeriod: BillingPeriod,
  planStartedAt: Date,
  now: Date,
): Date | null {
  if (billingPeriod === 'NONE') return null;
  const currentStart = contactPeriodStart(billingPeriod, planStartedAt, now);
  const monthsFromPlanStart =
    (currentStart.getUTCFullYear() - planStartedAt.getUTCFullYear()) * 12 +
    (currentStart.getUTCMonth() - planStartedAt.getUTCMonth());
  return addMonthsClamped(planStartedAt, monthsFromPlanStart + 1);
}
