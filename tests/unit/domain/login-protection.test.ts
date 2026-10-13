import { describe, expect, it } from 'vitest';
import {
  AFTER_SUCCESSFUL_LOGIN,
  afterFailedLogin,
  isCaptchaRequired,
  isLockedOut,
  type LoginFailureState,
} from '@/domain/login-protection';

const now = new Date('2026-10-09T10:00:00Z');
const minutes = (count: number) => new Date(now.getTime() + count * 60_000);

describe('login protection (UC-A2, SR-3)', () => {
  it('counts failures below the threshold without locking', () => {
    const state = afterFailedLogin({ failedLoginCount: 3, lockedUntil: null }, now);

    expect(state).toEqual({ failedLoginCount: 4, lockedUntil: null });
  });

  it('UC-A2 locks for 15 minutes on the fifth failure and resets the count', () => {
    const state = afterFailedLogin({ failedLoginCount: 4, lockedUntil: null }, now);

    expect(state).toEqual({ failedLoginCount: 0, lockedUntil: minutes(15) });
  });

  it('UC-A2 lockout ends after 15 minutes', () => {
    const locked: LoginFailureState = { failedLoginCount: 0, lockedUntil: minutes(15) };

    expect(isLockedOut(locked, minutes(14))).toBe(true);
    expect(isLockedOut(locked, minutes(15))).toBe(false);
  });

  it('clears everything after a successful sign-in', () => {
    expect(AFTER_SUCCESSFUL_LOGIN).toEqual({ failedLoginCount: 0, lockedUntil: null });
  });

  it('SR-3 requires a CAPTCHA from the third recent failure', () => {
    expect(isCaptchaRequired(2)).toBe(false);
    expect(isCaptchaRequired(3)).toBe(true);
  });
});
