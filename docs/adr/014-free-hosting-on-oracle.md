# ADR-014: Free hosting in India on Oracle Cloud's Always Free tier

**Status:** accepted · 2026-11-16

## Context

The product owner wants the pilot hosted in an Indian data centre at no cost, on their own
domain. AWS (ADR-009/010) gives new accounts credits for 6 months only; Google's free server is
US-only; Azure's free year runs out. Oracle Cloud's "Always Free" tier has no time limit, has
Mumbai and Hyderabad regions, and its ARM allowance (4 cores, 24 GB, 200 GB disk, 10 TB
traffic a month) fits the whole stack on one server.

## Decision

- One `VM.Standard.A1.Flex` server (Ubuntu 24.04, ARM) in the account's home region, Mumbai
  or Hyderabad (PR-12), running the laptop pilot's Docker Compose stack with Caddy instead of
  the quick tunnel (`infra/oracle`). The app image is built on the server from the
  repository; no registry is needed.
- ClamAV uses its Debian image, which has an ARM build (the Alpine one doesn't).
- Still `APP_ENV=pilot` (invite-only) until the legal documents are final; uploads on the
  server's disk, daily backups on the server plus optional upload to the free Object Storage
  (a write-only pre-authenticated request), email through Gmail.
- The account is upgraded to pay-as-you-go (still ₹0 within the free limits) so Oracle
  doesn't reclaim the server for looking idle, with a budget alert on any charge.

## Consequences

- One server: an update restarts the app for a few seconds, and a server failure means
  restoring from backup (as in ADR-010). Fine for an invite-only pilot.
- Free ARM capacity in Mumbai is sometimes unavailable; Hyderabad or retrying later works.
- Moving to AWS later (ADR-009) is a backup-and-restore; the app and data are the same.
