/** Plan rules: trials, credit packs and why a limit blocks an action (FR-11, UC-B1 to UC-B3). Pure. */

const DAY_MS = 86_400_000;

/** FR-11.2: why an action is blocked; each has its own message and upgrade advice. */
export type PlanLimitReason =
  | 'trialEnded'
  | 'requestsUsed'
  | 'noCredits'
  | 'seatsFull'
  | 'shortlistsFull'
  | 'featureNotIncluded';

/** UC-D1: a trial is over from its end time on; plans without an end never are. */
export function isTrialOver(trialEndsAt: Date | null, now: Date): boolean {
  return trialEndsAt !== null && trialEndsAt.getTime() <= now.getTime();
}

export interface CreditPackBalance {
  readonly id: string;
  readonly credits: number;
  readonly creditsUsed: number;
  readonly expiresAt: Date;
}

const hasCreditsLeft = (pack: CreditPackBalance, now: Date) =>
  pack.creditsUsed < pack.credits && pack.expiresAt.getTime() > now.getTime();

/** Pay-as-you-go: unused credits in packs that haven't expired. */
export function usableCredits(packs: readonly CreditPackBalance[], now: Date): number {
  return packs
    .filter((pack) => hasCreditsLeft(pack, now))
    .reduce((sum, pack) => sum + pack.credits - pack.creditsUsed, 0);
}

/** The pack to take a credit from: the one expiring first, so fewer credits go to waste. */
export function packToUse(
  packs: readonly CreditPackBalance[],
  now: Date,
): CreditPackBalance | null {
  const usable = packs.filter((pack) => hasCreditsLeft(pack, now));
  usable.sort((first, second) => first.expiresAt.getTime() - second.expiresAt.getTime());
  return usable[0] ?? null;
}

/** When a new pack bought now stops being valid. */
export function creditPackExpiry(boughtAt: Date, validDays: number): Date {
  return new Date(boughtAt.getTime() + validDays * DAY_MS);
}

export type TrialNotice = 'ENDING' | 'ENDED';

/**
 * Which trial email is due: "ending soon" within `daysBefore` of the end, then "ended"
 * once it has ended. Each is sent once.
 */
export function trialNoticeDue(
  brand: {
    readonly trialEndsAt: Date | null;
    readonly trialEndingNoticeSentAt: Date | null;
    readonly trialEndedNoticeSentAt: Date | null;
  },
  now: Date,
  daysBefore: number,
): TrialNotice | null {
  if (!brand.trialEndsAt) return null;
  if (isTrialOver(brand.trialEndsAt, now)) return brand.trialEndedNoticeSentAt ? null : 'ENDED';
  const isEndingSoon = brand.trialEndsAt.getTime() - now.getTime() <= daysBefore * DAY_MS;
  return isEndingSoon && !brand.trialEndingNoticeSentAt ? 'ENDING' : null;
}
