# Creator Platform

A platform that helps brands find, verify and contact regional content creators, starting with
India. Creators join free and get a verified profile with a transparent content score; brands
search, shortlist, chat and track campaigns.

- Product spec: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)
- Engineering rules: [CLAUDE.md](CLAUDE.md)
- Requirement → code → test map: [docs/TRACEABILITY.md](docs/TRACEABILITY.md)
- Decisions: [docs/adr/](docs/adr/)

> **Status:** Phase a (skeleton). Accounts, profiles, search and the rest arrive in phases b–h.

## Set up (local)

Needs Node 24 (see `.nvmrc`), npm 11.19+, and Docker.

1. `npm install`
2. `cp .env.example .env` (the defaults work with Docker Compose)
3. `docker compose up -d` starts PostgreSQL 16 with pgvector, plus a separate test database
4. `npm run db:migrate` applies migrations
5. `npm run db:seed` loads reference data (country, languages, categories, plans)
6. `npm run dev`, then open http://localhost:3000
7. `npm run worker` (in a second terminal) runs background jobs

## Commands

| Command                                          | What it does                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `npm run dev`                                    | Start the web app with hot reload                                                  |
| `npm run worker`                                 | Start the background job worker (pg-boss)                                          |
| `npm run check`                                  | Lint, format check, typecheck, unit and integration tests. Run before every commit |
| `npm run test:unit` / `npm run test:integration` | One test project only (integration needs Docker)                                   |
| `npm run test:coverage`                          | Tests with the 80% line-coverage floor on `domain/` and `services/`                |
| `npm run test:e2e`                               | Build, start, and run Playwright end-to-end tests (desktop and 360px phone)        |
| `npm run db:migrate`                             | Create/apply migrations in development                                             |
| `npm run db:seed`                                | Load reference and demo data (refuses to run when `APP_ENV=production`)            |
| `docker compose up -d`                           | Local PostgreSQL (pgvector)                                                        |

## Environment variables

All variables are documented in [.env.example](.env.example) and validated at startup by
[src/config/env.ts](src/config/env.ts); the app refuses to start if any are invalid.

| Variable                               | Required         | Purpose                                              |
| -------------------------------------- | ---------------- | ---------------------------------------------------- |
| `APP_ENV`                              | no (development) | development, test, staging or production             |
| `APP_URL`                              | yes              | Public base URL                                      |
| `DATABASE_URL`                         | yes              | PostgreSQL connection                                |
| `DATABASE_URL_TEST`                    | tests only       | Integration-test database (name must end in `_test`) |
| `LOG_LEVEL`                            | no (info)        | Log verbosity                                        |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | no               | Error reporting; personal data is not collected      |

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
- **A social platform:** arrives in phase c (one provider class behind `SocialPlatformProvider`).
