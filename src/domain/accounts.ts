export type UserRole = 'CREATOR' | 'BRAND' | 'ADMIN';

/** Roles a person can choose at sign-up. Admins are created by operators, never by sign-up. */
export const SELF_SERVICE_ROLES = ['CREATOR', 'BRAND'] as const satisfies readonly UserRole[];
export type SelfServiceRole = (typeof SELF_SERVICE_ROLES)[number];

export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';

export type SignInBlocker = 'SUSPENDED' | 'EMAIL_NOT_VERIFIED';

/** Why an account with correct credentials still can't sign in, or null if it can. */
export function findSignInBlocker(user: {
  readonly status: UserStatus;
  readonly emailVerifiedAt: Date | null;
}): SignInBlocker | null {
  if (user.status === 'SUSPENDED') return 'SUSPENDED';
  if (user.emailVerifiedAt === null) return 'EMAIL_NOT_VERIFIED';
  return null;
}

/** SR-4: admins must complete a TOTP check in every session. */
export function requiresTwoFactor(role: UserRole): boolean {
  return role === 'ADMIN';
}
