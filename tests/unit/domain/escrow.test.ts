import { describe, expect, it } from 'vitest';
import { canCancelFundedDeal, escrowCharge, isEscrowHeld } from '@/domain/escrow';

describe('escrow (ADR-013)', () => {
  it('adds the processing fee on top, rounded up to the paisa', () => {
    expect(escrowCharge(3_000_000, 236)).toEqual({ feeMinor: 70_800, chargedMinor: 3_070_800 });
    expect(escrowCharge(101, 236)).toEqual({ feeMinor: 3, chargedMinor: 104 });
    expect(escrowCharge(1_000, 0)).toEqual({ feeMinor: 0, chargedMinor: 1_000 });
  });

  it('knows when the money is with the gateway', () => {
    expect(isEscrowHeld('FUNDED')).toBe(true);
    expect(isEscrowHeld('RELEASE_PENDING')).toBe(true);
    expect(isEscrowHeld('REFUND_PENDING')).toBe(true);
    expect(isEscrowHeld('AWAITING_PAYMENT')).toBe(false);
    expect(isEscrowHeld('RELEASED')).toBe(false);
    expect(isEscrowHeld(null)).toBe(false);
  });

  it('refunds a cancelled deal only before work was submitted', () => {
    expect(canCancelFundedDeal(false)).toBe(true);
    expect(canCancelFundedDeal(true)).toBe(false);
  });
});
