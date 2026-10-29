/**
 * Phase 2 success targets from the spec ("Success metrics"), shown next to the live figures
 * on the admin overview. "Per month" figures are compared over the last 30 days.
 */
export const SUCCESS_TARGETS = {
  verifiedCreators: 500,
  activeBrands: 50,
  requestsSent: 300,
  acceptanceRatePercent: 40,
  dealsCompleted: 60,
} as const;

export type SuccessMetric = keyof typeof SUCCESS_TARGETS;
