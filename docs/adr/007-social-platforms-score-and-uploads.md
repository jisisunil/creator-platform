# ADR-007: Social platforms, content score and uploads

**Status:** accepted · 2026-10-13

## Context

Phase c connects YouTube and Instagram through official APIs only, computes a transparent
content score, and accepts profile photos. Development must work without API keys or Meta
approval.

## Decision

- **One provider interface** (`adapters/social/provider.ts`) with typed errors: quota, revoked
  token, private or deleted account, personal Instagram account, temporary failure. YouTube
  uses the Data API v3 with the read-only scope; Instagram uses the Instagram API with
  Instagram Login (Business/Creator accounts only). A deterministic **Mock provider** is the
  default outside production (`SOCIAL_PROVIDER_MODE=mock`); env validation forbids it in
  staging and production. Its "login" goes through `/api/social/mock/authorize`.
- **Connections start with a plain form POST** to `/api/social/<platform>/start`, which checks
  the request origin (SR-8), stores a signed state cookie and 303-redirects to the official
  login. The callback checks the state and that the same creator is still signed in.
- **Ownership:** the official login makes an account verified. A YouTube channel can also be
  linked by URL, unverified. A second creator claiming an account opens an `OwnershipDispute`
  for admins (UC-M3) instead of moving it.
- **Refresh:** daily fan-out job, one queued job per account, 3 retries with exponential
  back-off for temporary errors; quota errors retry 6 hours later and keep old data.
- **Score v1:** pure domain function with weights and thresholds in `config/score.ts`, stored
  with `weightsVersion`. Search reads denormalised columns on `CreatorProfile`.
- **Uploads:** file type from magic bytes, 2 MB limit, ClamAV scan (`MALWARE_SCANNER=clamav`,
  required outside development), random storage keys, served only through signed URLs with a
  sandbox CSP. In production files move to object storage on a separate domain (phase i,
  SEC-8).

## Consequences

- Instagram needs Meta app review before real creators can connect; until then the platform
  can launch with YouTube plus unverified links (spec risk table).
- `pg` prints a deprecation warning about overlapping queries on one connection inside Prisma's
  transaction handling. It is harmless with `pg@8`; check Prisma's adapter before upgrading to
  `pg@9`.
