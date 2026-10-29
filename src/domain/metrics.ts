/**
 * Success metric "request acceptance rate": of the requests that have an outcome, the share
 * accepted, as a whole percentage. Still-open and withdrawn requests have no outcome yet or
 * were the brand's choice, so they are left out. Null when nothing has an outcome yet.
 */
export function acceptanceRatePercent(counts: {
  readonly accepted: number;
  readonly declined: number;
  readonly expired: number;
}): number | null {
  const decided = counts.accepted + counts.declined + counts.expired;
  if (decided === 0) return null;
  return Math.round((counts.accepted / decided) * 100);
}
