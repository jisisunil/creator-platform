import { cookies } from 'next/headers';
import { isHttpsApp, sessionCookieName, sessionCookieOptions } from './session-cookie-config';

/** The session token from the request cookie, if any. */
export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(sessionCookieName(isHttpsApp()))?.value ?? null;
}

/** Stores a new session token. Only callable from server actions and route handlers. */
export async function writeSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  const isHttps = isHttpsApp();
  store.set(sessionCookieName(isHttps), token, sessionCookieOptions(isHttps));
}

/** Removes the session cookie. Only callable from server actions and route handlers. */
export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(sessionCookieName(isHttpsApp()));
}
