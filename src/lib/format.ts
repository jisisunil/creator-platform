/**
 * Number and money display by the user's language and the country's conventions (NFR-8):
 * Indian grouping (1,00,000) and lakh/crore compact forms come from the en-IN / hi-IN
 * locales. Values are always stored raw; formatting happens only here.
 */
function localeTag(locale: string, countryCode: string): string {
  return `${locale}-${countryCode}`;
}

export function formatCount(value: number, locale: string, countryCode: string): string {
  return new Intl.NumberFormat(localeTag(locale, countryCode)).format(value);
}

/** Short form for large counts, e.g. "1.2L" for 1,20,000 in India. */
export function formatCompactCount(value: number, locale: string, countryCode: string): string {
  return new Intl.NumberFormat(localeTag(locale, countryCode), {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

const MINOR_UNITS = 100;

/** Money from minor units (paise) in its currency, without decimals for whole amounts. */
export function formatMoney(
  amountMinor: number,
  currency: string,
  locale: string,
  countryCode: string,
): string {
  const isWhole = amountMinor % MINOR_UNITS === 0;
  return new Intl.NumberFormat(localeTag(locale, countryCode), {
    style: 'currency',
    currency,
    maximumFractionDigits: isWhole ? 0 : 2,
  }).format(amountMinor / MINOR_UNITS);
}

/** Basis points as a percentage with one decimal, e.g. 250 → "2.5". */
export function basisPointsToPercent(basisPoints: number): string {
  return (basisPoints / 100).toFixed(1);
}
