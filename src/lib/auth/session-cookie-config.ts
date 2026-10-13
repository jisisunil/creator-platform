import { SESSION_MAX_AGE_MS } from '@/config/auth';

/**
 * The session cookie name. On HTTPS the `__Host-` prefix makes browsers insist on Secure,
 * Path=/ and no Domain, so subdomains can't set or read it (SR-2).
 */
export function sessionCookieName(isHttps: boolean): string {
  return isHttps ? '__Host-session' : 'session';
}

/** Cookie attributes for the session (SR-2): HttpOnly, SameSite=Lax, Secure on HTTPS. */
export function sessionCookieOptions(isHttps: boolean) {
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  };
}

/** Whether the app is served over HTTPS (decides cookie name and Secure flag). */
export function isHttpsApp(): boolean {
  return process.env.APP_URL?.startsWith('https://') ?? false;
}
