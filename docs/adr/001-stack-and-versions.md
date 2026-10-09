# ADR-001: Stack and version choices

**Status:** accepted · 2026-10-09

## Context

The stack is fixed by the project brief (Next.js App Router, TypeScript strict, PostgreSQL 16 +
pgvector, Prisma, Auth.js, Zod, Tailwind + shadcn/ui, next-intl, pg-boss, Vitest, Playwright,
Sentry). Some `latest` npm tags were not safe to adopt on 2026-10-09.

## Decision

- **Next.js 16.4** (React 19.3). Next 16 renames `middleware.ts` to `proxy.ts`; ours is `src/proxy.ts`.
- **TypeScript 6.0**, not 7.0: `typescript-eslint` supports `<6.1`.
- **Prisma 7.10**, not 8.0: npm's `latest` tag points at `8.0.0-rc.22`, a release candidate.
  Prisma 7 uses the `prisma-client` generator (output in `src/generated/prisma`, git-ignored),
  `prisma.config.ts`, and the `@prisma/adapter-pg` driver adapter.
- **ESLint 9** (maintenance line), because `eslint-config-next` plugins are tested on 9.
- **Vitest 5** with two projects: `unit` (no I/O) and `integration` (real Postgres test DB).
- **Sentry 11**: `dataCollection` turns off all personal-data collection; `beforeSend` scrubs again.
- Exact versions are pinned in `package.json`, and `package-lock.json` is committed.

## Consequences

- Upgrading to Prisma 8 or TypeScript 7 is a deliberate later task, not a Dependabot merge.
- `npm audit` flags Prisma CLI internals (`mysql2`, `deepmerge-ts`); both are overridden to patched
  versions in `package.json#overrides`. `braces` (via `eslint-config-next`, lint-time only) has no fix
  yet; CI gates on `npm audit --omit=dev`, and Trivy scans the shipped image.
