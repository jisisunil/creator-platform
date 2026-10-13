import { Secret, TOTP } from 'otpauth';

/** Time-based one-time passwords for admin two-factor sign-in (SR-4). */
export interface TotpService {
  /** A new random secret, base32-encoded. */
  createSecret(): string;
  /** otpauth:// URI for authenticator apps (shown as a QR code). */
  buildEnrolmentUri(secret: string, accountLabel: string): string;
  /** True when `code` is valid at `now`, allowing one 30-second step of clock drift. */
  verify(secret: string, code: string, now: Date): boolean;
}

const ISSUER = 'Creator Platform';
const SECRET_BYTES = 20;
const ALLOWED_DRIFT_STEPS = 1;

function totpFor(secret: string, label = 'account'): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1', // what authenticator apps support universally
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
}

/** RFC 6238 TOTP via the otpauth library. */
export function createTotpService(): TotpService {
  return {
    createSecret: () => new Secret({ size: SECRET_BYTES }).base32,
    buildEnrolmentUri: (secret, accountLabel) => totpFor(secret, accountLabel).toString(),
    verify(secret, code, now) {
      const delta = totpFor(secret).validate({
        token: code.replace(/\s/g, ''),
        timestamp: now.getTime(),
        window: ALLOWED_DRIFT_STEPS,
      });
      return delta !== null;
    },
  };
}
