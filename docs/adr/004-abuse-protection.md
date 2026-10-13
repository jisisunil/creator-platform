# ADR-004: Rate limits in Postgres, Turnstile CAPTCHA, HIBP password check

**Status:** accepted · 2026-10-09

## Context

SR-1, SR-3 and SR-11 ask for breached-password checks, per-IP and per-account rate limits,
lockout, CAPTCHA after repeated failures and bot detection on sign-up. CLAUDE.md §16 rules out
extra infrastructure that isn't needed yet.

## Decision

- **Rate limits:** fixed-window counters in `RateLimitCounter`, one atomic upsert per attempt.
  Keys are SHA-256 hashes, so no raw IP or email is stored. Limits live in `src/config/auth.ts`.
  Client IPs come from `X-Forwarded-For`, trusting only `TRUSTED_PROXY_HOPS` proxies.
- **Lockout:** 5 wrong passwords lock the account for 15 minutes. Unknown email, wrong
  password and locked account all return the same error, in the same time.
- **CAPTCHA:** Cloudflare Turnstile on every sign-up and after 3 recent failures on sign-in.
  Off in development; env validation makes it mandatory in staging and production.
- **Breached passwords:** Have I Been Pwned range API (k-anonymity: only 5 hex characters of
  the SHA-1 leave the server), with a bundled list of common passwords as a fallback when the
  service is slow or down.

## Consequences

- Turnstile receives the client IP and HIBP receives a hash prefix: both are listed in
  `docs/processors.md` and must appear in the privacy notice (PR-11).
- Postgres counters are fine at launch volume; move to Redis only if measurements say so.
