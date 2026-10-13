import {
  CAPTCHA_AFTER_FAILURES,
  LOGIN_LOCKOUT_DURATION_MS,
  LOGIN_LOCKOUT_THRESHOLD,
} from '@/config/auth';

export interface LoginFailureState {
  readonly failedLoginCount: number;
  readonly lockedUntil: Date | null;
}

/** True while a lockout is in force (UC-A2). */
export function isLockedOut(state: LoginFailureState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/**
 * The state after one more wrong password. The fifth consecutive failure locks the account
 * for 15 minutes and resets the count, so the next lockout needs five fresh failures.
 */
export function afterFailedLogin(state: LoginFailureState, now: Date): LoginFailureState {
  const failedLoginCount = state.failedLoginCount + 1;
  if (failedLoginCount >= LOGIN_LOCKOUT_THRESHOLD) {
    return {
      failedLoginCount: 0,
      lockedUntil: new Date(now.getTime() + LOGIN_LOCKOUT_DURATION_MS),
    };
  }
  return { failedLoginCount, lockedUntil: state.lockedUntil };
}

/** The state after a successful sign-in. */
export const AFTER_SUCCESSFUL_LOGIN: LoginFailureState = { failedLoginCount: 0, lockedUntil: null };

/** SR-3: ask for a CAPTCHA once recent failures reach the threshold. */
export function isCaptchaRequired(recentFailures: number): boolean {
  return recentFailures >= CAPTCHA_AFTER_FAILURES;
}
