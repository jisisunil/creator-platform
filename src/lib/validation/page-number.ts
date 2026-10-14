/** A page number from a query parameter: 1 for anything missing or invalid. */
export function pageNumberFrom(value: string | string[] | undefined): number {
  const parsed = typeof value === 'string' && /^\d{1,4}$/.test(value) ? Number(value) : 1;
  return Math.max(1, parsed);
}
