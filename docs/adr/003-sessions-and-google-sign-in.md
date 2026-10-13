# ADR-003: Our own sessions; Auth.js only for the Google handshake

**Status:** accepted · 2026-10-09

## Context

SR-2 needs revocable sessions: sign out everywhere, revoke on password change or suspension,
30-day sliding expiry. Auth.js does not create database sessions for email-and-password
sign-in, and its default user creation can't collect the role, 18+ confirmation and consent
that PRV-1 requires before an account exists. UC-A2 also requires a password check before a
Google login is linked to an existing password account.

## Decision

- Sessions are ours: a random 256-bit token in an HttpOnly, SameSite=Lax cookie
  (`__Host-session` on HTTPS). Only its SHA-256 hash is stored in `Session`.
  `resolveSession` slides the expiry (at most hourly); the proxy re-issues the cookie on GET.
- Auth.js runs only the Google OAuth handshake. Its `signIn` callback passes the verified
  profile to `resolveGoogleSignIn`, which signs in, creates the account (if the user came from
  sign-up with consent given), or asks for the password before linking. The callback always
  returns a redirect, so Auth.js never creates a user or session of its own.
- Choices made before leaving for Google (role, marketing, brand details) travel in a signed,
  15-minute cookie. No provider tokens are stored for sign-in.
- Emailed links (verify, reset, change email) are confirmed with a button press, never on page
  load, because email security scanners open links automatically and would use them up.
- Admin TOTP (SR-4) is verified per session (`Session.twoFactorVerifiedAt`, valid 12 hours).

## Consequences

- One session system for every sign-in method, fully covered by integration tests.
- The Google callback path depends on Auth.js internals behaving as documented (a string from
  `signIn` means "redirect, no session"); it needs a manual check with real Google credentials
  before launch.
