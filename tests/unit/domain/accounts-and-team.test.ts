import { describe, expect, it } from 'vitest';
import { findSignInBlocker, requiresTwoFactor } from '@/domain/accounts';
import { hasFreeSeat } from '@/domain/team';

describe('findSignInBlocker (UC-A2)', () => {
  it('blocks suspended accounts before anything else', () => {
    expect(findSignInBlocker({ status: 'SUSPENDED', emailVerifiedAt: new Date() })).toBe(
      'SUSPENDED',
    );
  });

  it('blocks accounts whose email is not verified (FR-1.1)', () => {
    expect(findSignInBlocker({ status: 'PENDING_VERIFICATION', emailVerifiedAt: null })).toBe(
      'EMAIL_NOT_VERIFIED',
    );
  });

  it('lets active, verified accounts in', () => {
    expect(findSignInBlocker({ status: 'ACTIVE', emailVerifiedAt: new Date() })).toBeNull();
  });
});

describe('requiresTwoFactor (SR-4)', () => {
  it('requires two-factor for admins only at launch', () => {
    expect(requiresTwoFactor('ADMIN')).toBe(true);
    expect(requiresTwoFactor('BRAND')).toBe(false);
    expect(requiresTwoFactor('CREATOR')).toBe(false);
  });
});

describe('hasFreeSeat (UC-A6, UC-B3)', () => {
  it('UC-A6 counts pending invites against the seat limit', () => {
    expect(hasFreeSeat({ memberCount: 2, pendingInviteCount: 0, seatLimit: 3 })).toBe(true);
    expect(hasFreeSeat({ memberCount: 2, pendingInviteCount: 1, seatLimit: 3 })).toBe(false);
  });

  it('UC-B3 blocks new invites after a downgrade leaves more members than seats', () => {
    expect(hasFreeSeat({ memberCount: 3, pendingInviteCount: 0, seatLimit: 1 })).toBe(false);
  });
});
