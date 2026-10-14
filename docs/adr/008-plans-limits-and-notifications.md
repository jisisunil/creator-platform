# ADR-008: Plans, limits and notifications

**Status:** accepted · 2026-10-15

## Context

Phase f enforces plan limits (FR-11), trials and pay-as-you-go packs (spec: Monetisation),
and notifications with preferences (FR-12). There is no online payment yet (FR-11.4 is
"Later") and no admin console until phase g.

## Decision

- **No usage-counter table.** Contact requests used in a period are counted from
  `CollabRequest` rows since the period start (monthly anniversary of `planStartedAt`; the
  whole plan for trials). The count and the new request happen in one transaction under a
  row lock on the brand, so limits hold under concurrency (UC-B2). Withdrawn, declined and
  expired requests still count.
- **Pay-as-you-go** plans (`Plan.usesCreditPacks`) take one credit per request from the
  pack that expires first (`CreditPack`, 10 or 50 credits, 90 days), in the same
  transaction; the request records which pack paid for it. Admins add packs after payment
  until a payment gateway exists.
- **One trial per company (UC-B1):** a trial is refused (it starts already ended) when a
  brand with the same company email domain has had one, or another brand owner has the same
  mailbox (`User.canonicalEmail`: "+tags" dropped, Gmail dots ignored). Public mail domains
  never count as a company. Attempts are logged; admins can extend trials.
- **Limit reasons:** `PLAN_LIMIT_REACHED` carries a reason as the `plan` field error, so
  every form shows why (trial ended, requests used, no credits, seats, shortlists, feature)
  and links to the plan page. Plan changes go through a sales email (`SALES_EMAIL`).
- **Notifications:** one entry point (`notifyUsers`) writes an in-app `Notification` and
  queues an email, per user preference by category and channel (on unless turned off).
  Security emails never go through it, so they can't be disabled (FR-12.2). New-message
  notices go out once per unread batch and never include message text. Notifications are
  deleted after 180 days.

## Consequences

- Counting rows keeps one source of truth; a usage table can be added if counting becomes
  slow (indexed on brand and time, so not expected at MVP scale).
- Trial detection can be beaten by a new company domain or a different mailbox; it stops
  the common case (same company, "+tag" sign-ups) without collecting more personal data.
- Admin screens for plans, trials and packs arrive with the console in phase g; until then
  the service functions are tested but only reachable from code.
