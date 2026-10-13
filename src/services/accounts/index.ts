/** Accounts module: sign-up, sign-in, sessions, passwords, email, two-factor (FR-1, UC-A1..A4). */
export { changePassword, confirmEmailChange, requestEmailChange } from './account-settings';
export { resendVerificationEmail, verifyEmail } from './email-verification';
export {
  type GoogleProfile,
  type GoogleSignInOutcome,
  linkGoogleAfterPasswordCheck,
  type PendingGoogleSignUp,
  resolveGoogleSignIn,
} from './google';
export { createAccount } from './new-account';
export { requestPasswordReset, resetPassword } from './password-reset';
export { hashAcceptablePassword } from './passwords';
export {
  type ActiveSession,
  type IssuedSession,
  resolveSession,
  signOut,
  signOutEverywhere,
} from './sessions';
export {
  completeSignIn,
  isCaptchaNeededForSignIn,
  type SignInResult,
  signInWithPassword,
} from './sign-in';
export { type SignUpInput, signUpWithPassword } from './sign-up';
export { hasTwoFactorEnabled, startTotpEnrolment, verifyTwoFactorCode } from './two-factor';
