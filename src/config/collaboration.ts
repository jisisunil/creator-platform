/** Collaboration tunables: requests, chat, deals and ratings (FR-7 to FR-10). */

/** FR-7.2: an unanswered request expires after this many days. */
export const REQUEST_EXPIRY_DAYS = 14;

/** FR-7.1 field limits. */
export const REQUEST_LIMITS = {
  campaignNameMax: 80,
  briefMin: 20,
  briefMax: 3000,
  declineReasonMax: 500,
  maxQuantityPerLine: 20,
  /** ₹1 crore: anything larger is almost certainly a typo. */
  maxBudgetRupees: 1_00_00_000,
  /** The deadline must be within this many days of sending. */
  maxDeadlineDays: 365,
} as const;

/** Rows per page on request, deal and message lists. */
export const COLLABORATION_PAGE_SIZE = 20;
