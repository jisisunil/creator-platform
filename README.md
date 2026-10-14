# Creator Platform

A platform that helps brands find, verify and contact regional content creators, starting with
India. Creators join free and get a verified profile with a transparent content score; brands
search, shortlist, chat and track campaigns.

- Product spec: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
- Engineering rules: [CLAUDE.md](CLAUDE.md)
- Requirement → code → test map: [docs/TRACEABILITY.md](docs/TRACEABILITY.md)
- Decisions: [docs/adr/](docs/adr/)

> **Status:** Phases a–f are built: skeleton, accounts and security, creator profiles with
> YouTube/Instagram and the content score, brand search with shortlists, compare and saved
> searches, collaboration (requests, chat, deals, campaign reports, ratings), and plans with
> trials, credit packs and notifications. Admin, hardening and infrastructure arrive in
> phases g–i.

## Set up (local)

Needs Node 24 (see `.nvmrc`), npm 11.19+, and Docker.

1. `npm install`
2. `cp .env.example .env` (the defaults work with Docker Compose)
3. `docker compose up -d` starts PostgreSQL 16 with pgvector (plus a test database) and Mailpit
4. `npm run db:migrate` applies migrations
5. `npm run db:seed` loads reference data and fake demo accounts (logins printed; password
   `Demo-Password-2026`; the admin sets up two-factor on first sign-in)
6. `npm run dev`, then open http://localhost:3000
7. `npm run worker` (in a second terminal) runs background jobs, including sending email
8. Read emails sent in development at http://localhost:8025 (Mailpit)

## Commands

| Command                                          | What it does                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `npm run dev`                                    | Start the web app with hot reload                                                  |
| `npm run worker`                                 | Start the background job worker (pg-boss)                                          |
| `npm run check`                                  | Lint, format check, typecheck, unit and integration tests. Run before every commit |
| `npm run test:unit` / `npm run test:integration` | One test project only (integration needs Docker)                                   |
| `npm run test:coverage`                          | Tests with the 80% line-coverage floor on `domain/` and `services/`                |
| `npm run test:e2e`                               | Build, then run Playwright tests against the app and worker (desktop and 360px)    |
| `npm run db:migrate`                             | Create/apply migrations in development                                             |
| `npm run db:seed`                                | Load reference and demo data (refuses to run when `APP_ENV=production`)            |
| `docker compose up -d`                           | Local PostgreSQL (pgvector) and Mailpit                                            |

## Environment variables

All variables are documented in [.env.example](.env.example) and validated at startup by
[src/config/env.ts](src/config/env.ts); the app refuses to start if any are invalid.

| Variable                                                      | Required           | Purpose                                                       |
| ------------------------------------------------------------- | ------------------ | ------------------------------------------------------------- |
| `APP_ENV`                                                     | no (development)   | development, test, staging or production                      |
| `APP_URL`                                                     | yes                | Public base URL                                               |
| `DATABASE_URL`                                                | yes                | PostgreSQL connection                                         |
| `DATABASE_URL_TEST`                                           | tests only         | Integration-test database (name must end in `_test`)          |
| `LOG_LEVEL`                                                   | no (info)          | Log verbosity                                                 |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`                        | no                 | Error reporting; personal data is not collected               |
| `AUTH_SECRET`                                                 | yes                | Signs short-lived Google sign-up state                        |
| `TOKEN_ENCRYPTION_KEY`                                        | yes                | 32-byte key encrypting TOTP secrets (and social tokens later) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`                        | no                 | Google sign-in; set both or neither                           |
| `SMTP_URL`, `EMAIL_FROM`                                      | yes                | Outgoing email (Mailpit locally)                              |
| `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`      | staging/production | CAPTCHA                                                       |
| `BREACHED_PASSWORD_CHECK`                                     | no (hibp)          | `hibp` online check or `offline` list                         |
| `TRUSTED_PROXY_HOPS`                                          | no (0)             | Reverse proxies to trust for the client IP                    |
| `SALES_EMAIL`                                                 | staging/production | Shown on the plan page for plan changes and credit packs      |
| `SOCIAL_PROVIDER_MODE`                                        | no (mock)          | `mock` (development) or `live` (official APIs)                |
| `YOUTUBE_API_KEY`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | live mode          | YouTube Data API and Instagram API credentials                |
| `FILE_STORAGE_DIR`                                            | no (./storage)     | Private uploads (photos, chat attachments)                    |
| `MALWARE_SCANNER`, `CLAMAV_HOST`, `CLAMAV_PORT`               | staging/production | Upload scanning with ClamAV                                   |

## Architecture

```
src/app        pages and API routes (thin: auth → authorise → validate → one service call)
src/services   use cases and workflows, one folder per module
src/domain     pure business rules, no I/O
src/adapters   database repositories, external APIs, email, storage, crypto; wired in container.ts
src/lib        small shared helpers (logger, errors → HTTP, CSP, request context)
src/config     env, plans, countries, categories, languages, locales
src/i18n       translation files (en, hi) and routing
worker/        background job entry point and jobs
prisma/        schema, migrations, seed
tests/         unit, integration (real Postgres), security, e2e (Playwright), fakes
```

Dependencies point inward (`app → services → domain`), and ESLint enforces it. One web app and
one worker process share PostgreSQL. pg-boss keeps its job queue in the `pgboss` schema, so
there is no separate broker.

## How to add…

- **A language:** add the code to `SUPPORTED_LOCALES` in `src/config/locales.ts`, then add
  `src/i18n/<code>.json` with every key from `en.json` (a unit test checks the keys match).
- **A country:** add an entry to `src/config/countries.ts`, its categories to
  `src/config/categories.ts` and its plans to `src/config/plans.ts`, then run `npm run db:seed`.
  Work through the per-country launch checklist in the spec first.
- **A social platform:** add a class implementing `SocialPlatformProvider`
  (`src/adapters/social/provider.ts`), register it in `src/adapters/social/registry.ts`, add the
  value to the `SocialPlatform` enum (migration) and enable it per country in `CountrySettings`.
- **Real YouTube/Instagram data:** set `SOCIAL_PROVIDER_MODE=live` with the API keys in
  `.env.example`. Mock mode (the default) needs no keys; demo creators are seeded. In mock
  mode a post link for a deal looks like `https://mock.social/<account id>/<post name>`, where
  the account id is the handle shown on the creator's connected accounts (without the `@`);
  post names containing `deleted` or `private` simulate those cases.
- **A social platform's posts (campaign reports):** the provider's `parsePostUrl` and
  `fetchPostStats` must only accept posts on the creator's own account.
