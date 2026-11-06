/**
 * Escrow rules (ADR-013): what the brand pays, and which held payments the platform may
 * release or refund. Pure: no I/O.
 */

const BASIS_POINTS = 10_000;

export type PaymentMethod = 'DIRECT' | 'ESCROW';

export type EscrowStatus =
  'AWAITING_PAYMENT' | 'FUNDED' | 'RELEASE_PENDING' | 'RELEASED' | 'REFUND_PENDING' | 'REFUNDED';

/** The money is with the gateway: paid by the brand, not yet released or refunded. */
export function isEscrowHeld(status: EscrowStatus | null): boolean {
  return status === 'FUNDED' || status === 'RELEASE_PENDING' || status === 'REFUND_PENDING';
}

/**
 * What the brand pays: the contract amount, which the creator receives in full, plus the
 * gateway's processing fee (rounded up to the next paisa).
 */
export function escrowCharge(
  amountMinor: number,
  feeBasisPoints: number,
): { readonly feeMinor: number; readonly chargedMinor: number } {
  const feeMinor = Math.ceil((amountMinor * feeBasisPoints) / BASIS_POINTS);
  return { feeMinor, chargedMinor: amountMinor + feeMinor };
}

/**
 * ADR-013: a funded deal can be cancelled (and the brand refunded) only before any work was
 * submitted; after that, the sides agree through an admin, who releases or refunds.
 */
export function canCancelFundedDeal(hasSubmissions: boolean): boolean {
  return !hasSubmissions;
}
