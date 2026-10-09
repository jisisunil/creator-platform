# ADR-002: Nonce-based CSP, so pages render per request

**Status:** accepted · 2026-10-09

## Context

SR-8 requires a Content Security Policy. A policy that allows `'unsafe-inline'` scripts gives little
XSS protection. Next.js supports per-request script nonces, but only on dynamically rendered pages.

## Decision

`src/proxy.ts` generates a nonce per request and sets a strict CSP
(`script-src 'self' 'nonce-…' 'strict-dynamic'`, `frame-ancestors 'none'`, `object-src 'none'`).
The `[locale]` layout sets `dynamic = 'force-dynamic'`. Other security headers (HSTS, nosniff,
X-Frame-Options, Referrer-Policy, Permissions-Policy) are static, in `next.config.ts`.
`upgrade-insecure-requests` is added only when `APP_URL` is https, so local http runs still work.

## Consequences

- No static HTML caching of pages. Most pages are per-user anyway (auth, plans, data). NFR-1
  (under 2 s on 4G) is checked in phase h.
- Styles allow `'unsafe-inline'` (Next.js and Radix set style attributes); styles cannot run code.
