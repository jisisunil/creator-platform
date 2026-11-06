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

/** FR-8 chat limits. */
export const CHAT_LIMITS = {
  messageMax: 2000,
  /** Messages shown per page; older ones load on request. */
  pageSize: 50,
  /**
   * FR-8.2 "early messages": the first 10 messages of a chat, or its first 48 hours,
   * whichever lasts longer. Contact details in them are flagged with a safety note.
   */
  earlyMessageCount: 10,
  earlyWindowMs: 48 * 3_600_000,
  /** How often an open chat page checks for new messages. */
  refreshIntervalMs: 20_000,
} as const;

/** SR-9: chat attachments: images and PDFs up to 10 MB. */
export const CHAT_ATTACHMENT = {
  maxBytes: 10 * 1024 * 1024,
  fileNameMax: 100,
} as const;

/** FR-8.3: a report's reason. */
export const REPORT_REASON_MAX = 1000;

/** FR-9 deal tunables. */
export const DEAL_LIMITS = {
  reasonMax: 500,
  postUrlMax: 500,
  /** UC-R5: without an agreed due date, payment is due this many days after approval. */
  paymentGraceDays: 7,
  /** UC-R5: overdue payments are reminded again every this many days. */
  paymentReminderRepeatDays: 7,
  /** Deals handled per reminder job run. */
  remindersPerRun: 500,
} as const;

/** ADR-012: deal contracts. */
export const DEAL_CONTRACT = {
  /** Bump when the standard clauses (i18n `contract.clauses`) change. */
  templateVersion: 1,
  additionalTermsMax: 3000,
  /** The brand's own contract: a PDF up to 10 MB. */
  fileMaxBytes: 10 * 1024 * 1024,
  fileNameMax: 100,
} as const;

/** ADR-012: proof of work and the brand's review. */
export const WORK_REVIEW = {
  /** Work the brand doesn't review within this many days is approved automatically. */
  reviewDays: 7,
  /** The brand may ask for changes this many times; after that it approves or disputes. */
  maxChangeRequests: 2,
  noteMax: 2000,
  linksMax: 5,
  linkMax: 500,
  /** Screenshots (images) or PDFs: up to 5 files, 10 MB in all (one form post: next.config). */
  filesMax: 5,
  totalBytesMax: 10 * 1024 * 1024,
  fileNameMax: 100,
  /** Deals handled per auto-approval job run. */
  autoApprovalsPerRun: 200,
} as const;

/** UC-R6: post stats are refreshed daily for 90 days after posting. */
export const POST_STATS_REFRESH = {
  staleAfterMs: 20 * 3_600_000,
  refreshForDays: 90,
  postsPerRun: 500,
} as const;

/** FR-10 ratings. */
export const RATING_RULES = {
  /** UC-R7: a rating shows this many days after completion even if the other side never rates. */
  revealAfterDays: 14,
  commentMax: 1000,
  /** Recent comments shown on a profile. */
  recentReviews: 5,
} as const;
