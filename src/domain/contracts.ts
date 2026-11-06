/**
 * Deal contracts (ADR-012): the terms a contract version fixes, and the exact content both
 * sides accept. Pure: no I/O.
 */
import type { CollabSide } from './chat';
import type { DeliverableLine, UsageRights } from './requests';

/** The terms a contract version records when it is issued. Dates are "YYYY-MM-DD" (UTC). */
export interface ContractTerms {
  readonly brandName: string;
  readonly creatorName: string;
  readonly campaignName: string;
  readonly brief: string;
  readonly deliverables: readonly DeliverableLine[];
  readonly usageRights: UsageRights;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly advancePercent: number | null;
  readonly paymentDueOn: string | null;
  readonly deadline: string;
  /** Days the brand has to review submitted work before it is approved automatically. */
  readonly reviewDays: number;
  /** How many times the brand may ask for changes. */
  readonly maxChangeRequests: number;
}

/** Everything a contract version's fingerprint covers. */
export interface ContractContent {
  readonly templateVersion: number;
  readonly terms: ContractTerms;
  readonly additionalTerms: string | null;
  /** SHA-256 of the uploaded PDF, when the brand uses its own document. */
  readonly fileSha256: string | null;
}

export type ContractState = 'NONE' | 'AWAITING_BRAND' | 'AWAITING_CREATOR' | 'SIGNED';

/** ADR-012: where the current contract version stands. */
export function contractStateOf(
  hasContract: boolean,
  acceptedBy: readonly CollabSide[],
): ContractState {
  if (!hasContract) return 'NONE';
  if (!acceptedBy.includes('BRAND')) return 'AWAITING_BRAND';
  return acceptedBy.includes('CREATOR') ? 'SIGNED' : 'AWAITING_CREATOR';
}

/** "YYYY-MM-DD" for a UTC date. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The contract content as one stable string (keys sorted at every level), so the same
 * content always gives the same fingerprint, whichever order fields were written in.
 */
export function canonicalContractContent(content: ContractContent): string {
  return stableStringify(content);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
