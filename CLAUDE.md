# CLAUDE.md — Engineering guide for this project

This file is the rulebook for all work in this repository. Follow it on every task.
If a rule here conflicts with a request, ask before breaking it. If a rule seems wrong
for a situation, say so and propose a change to this file — don't silently ignore it.

The product spec is `docs/REQUIREMENTS.md`. Requirement and use-case IDs (FR-*, UC-*,
SR-*, PR-*, NFR-*) come from there.

---

## 1. Core principles (in priority order)

1. **Correct and secure** — never trade correctness, security or privacy for speed.
2. **Simple** — the simplest design that meets the requirement wins. No speculative
   features, no abstractions "for later" unless the spec asks for an extension point.
3. **Readable** — code is read far more than written. Optimise for the next developer.
4. **Consistent** — follow existing patterns in the codebase before inventing new ones.
5. **Tested** — untested code is unfinished code.

YAGNI, KISS and DRY apply — but prefer a little duplication over the wrong abstraction.
Extract shared code only when the third copy appears and the copies truly mean the same thing.

## 2. How to work

- **Plan before coding** any change touching more than ~3 files: list files to change,
  approach, risks, and tests. Wait for approval on large changes.
- **Ask, don't assume**, when requirements are unclear, contradictory or missing.
  Write the open question down; never invent business rules.
- **Small steps:** one logical change at a time. Keep diffs focused; no drive-by
  refactors mixed with features (do them as a separate commit).
- **Read before writing:** look at neighbouring code, existing helpers and tests first.
- **Verify before saying "done":** run `npm run check` (lint + types + tests). Report
  what you ran and the result. Never claim tests pass without running them.
- **Never** disable lint rules, skip tests, use `@ts-ignore`, or weaken a type to make
  something compile. Fix the cause. If truly unavoidable, comment why and tell me.
- Update `docs/TRACEABILITY.md` when a requirement or use case is implemented.
- Record significant decisions as a short ADR in `docs/adr/NNN-title.md`
  (context, decision, consequences — half a page max).

## 3. Commands

```
npm run dev          # start the app
npm run worker       # start background jobs
npm run check        # lint + typecheck + unit/integration tests (run before every commit)
npm run test:e2e     # Playwright end-to-end tests
npm run db:migrate   # create/apply migrations (dev)
npm run db:seed      # load demo data
docker compose up    # PostgreSQL (pgvector), mail catcher, etc.
```

Keep this list accurate when scripts change.

## 4. Architecture rules

```
src/app        → pages and API routes (thin)
src/services   → use cases / business workflows
src/domain     → pure business rules (no I/O)
src/adapters   → database, external APIs, email, storage, crypto, AI
src/lib        → small shared helpers (auth guards, logger, rate limit, validation)
src/config     → env, score weights, plan definitions, country settings
worker/        → background job entry point and jobs
```

- **Dependencies point inward:** `app → services → domain`. `domain` imports nothing
  from `services`, `adapters`, `app`, Next.js or Prisma.
- **Services depend on interfaces, not implementations.** External systems (YouTube,
  Instagram, email, storage, embeddings, clock) are behind interfaces in `adapters/`.
  Wire concrete implementations in one place (`src/adapters/container.ts`).
- **API routes and server actions are thin:** authenticate → authorise → validate input
  (Zod) → call ONE service function → map result to response. No business logic, no
  Prisma calls in routes or React components.
- **Business rules live in services/domain only.** UI may hide a button, but the server
  always enforces the rule.
- **One module = one folder** in `services/` (accounts, creators, search, requests, …).
  A module exposes a small public API via its `index.ts`; other modules import only that.
- **No circular imports.** If two modules need each other, the shared part belongs in
  `domain/` or a new module.
- **Database access only through repositories** in `adapters/db/`. Services never build
  raw queries except where a repository method explicitly wraps raw SQL (e.g. pgvector).
- **Transactions:** a use case that changes several records runs in one transaction;
  the service owns the transaction boundary.
- Prefer plain functions and plain objects. Use classes only for adapters implementing
  an interface. No inheritance hierarchies; prefer composition.

### SOLID, applied pragmatically
- **S**: a function/module has one reason to change. Files over ~300 lines or functions
  over ~40 lines are a signal to split — not a hard rule.
- **O**: extend via new adapters/config (new platform = new provider class), not by
  adding `if (platform === ...)` branches across the code.
- **L**: every implementation of an interface must honour its contract, including errors.
- **I**: small interfaces (e.g. `SocialPlatformProvider` with only what callers need).
- **D**: services receive dependencies (parameters or a context object), so tests can
  pass fakes. No hidden singletons inside business logic.

## 5. TypeScript and code style

- `strict: true`, `noUncheckedIndexedAccess: true`. No `any`; use `unknown` and narrow.
- Prettier formats; ESLint enforces. Don't argue with the formatter.
- **Names say what things are/do:** `findCreatorsForSearch`, `isRequestExpired`,
  `contactRequestsRemaining`. No abbreviations except well-known ones (id, url, api).
  Booleans start with `is/has/can/should`. Files: `kebab-case.ts`; React components
  `PascalCase.tsx`.
- **Functions:** do one thing; ≤ 3–4 parameters (else pass an object); return early
  instead of deep nesting; no flag parameters that switch behaviour.
- **Immutability by default:** `const`, readonly types, no mutating inputs.
- **No magic numbers/strings:** named constants or config (`REQUEST_EXPIRY_DAYS = 14`).
- **Types:** model domain concepts explicitly (`type DealStatus = 'requested' | ...`).
  Use discriminated unions for states. Validate external data at the boundary with Zod
  and derive types from schemas (`z.infer`).
- **Dates:** store and compute in UTC; convert to the user's timezone only for display.
  Use one date library consistently.
- **Money:** integers in the smallest unit (paise/cents) + currency code. Never floats.
- **Comments explain *why*, not *what*.** Every exported function in `domain/` and
  `services/` gets a one-line doc comment. Delete commented-out code.
- No `console.log` in committed code; use the structured logger.
- No dead code, unused exports, or TODOs without an issue reference.

## 6. Error handling

- Expected business failures are **typed domain errors** (`PlanLimitReached`,
  `RequestExpired`, `NotAllowed`, `NotFound`, `ValidationError`) with a safe,
  user-facing message and a stable `code`.
- Routes map domain errors to HTTP status codes in ONE place. Unexpected errors →
  500 with a generic message; full details go to logs/Sentry only.
- Never swallow errors (`catch {}`); handle, wrap with context, or rethrow.
- External calls (YouTube, Instagram, email) have timeouts, retries with back-off for
  transient failures, and graceful degradation (keep last good data, show "last updated").
- Never leak stack traces, SQL, tokens or other users' data in responses.

## 7. Security (non-negotiable; see SR-* in the spec)

- **Every** endpoint and server action checks authentication AND authorisation
  (role + ownership: "does this brand own this shortlist?"). Deny by default.
  Write a test proving another account cannot access the resource.
- Validate all input server-side with Zod (types, lengths, ranges, enums).
- Use Prisma/parameterised queries only. Never build SQL with string concatenation.
- React escapes output — never use `dangerouslySetInnerHTML` with user content.
- Secrets only from environment/secrets manager via `src/config/env.ts` (validated at
  startup). Never commit secrets; never log them; `.env` is git-ignored.
- OAuth tokens encrypted at rest (`adapters/crypto`); request least permissions.
- Passwords via the auth library's hashing only. Never roll your own crypto.
- Rate-limit login, sign-up, search, requests and messages.
- File uploads: allow-list types, size limits, random names, private storage, signed URLs.
- Creators' email/phone must never appear in any brand-facing API response.
- Add/upgrade dependencies only when needed; prefer well-maintained packages; check
  licences (MIT/Apache/BSD fine). Run `npm audit` in CI.

## 8. Privacy (DPDP Act; see PR-* in the spec)

- Collect only fields listed in the spec's data inventory. Adding a new personal-data
  field requires updating the inventory and privacy notice — ask first.
- Consent is checked before processing; consent records are immutable (append-only).
- Every new table holding personal data must be covered by: account export, account
  deletion/anonymisation, and the retention job. Add tests for each.
- Logs never contain chat content, tokens, passwords, or full emails/phones (mask them).
- Do not send any personal data to third-party services (including AI) unless the spec
  says so and the processor is listed.
- Demo/seed data is clearly fake. Never copy production data to dev/test.

## 9. Database

- Schema changes only via Prisma migrations; migrations are committed and never edited
  after merge. Destructive changes (drop/rename column) need a two-step migration and
  my approval.
- Every table: `id` (UUID or cuid), `createdAt`, `updatedAt`; personal-data tables also
  support deletion/anonymisation.
- Add indexes for every foreign key and every column used in search filters/sorts.
- Use enums or check constraints for status fields; unique constraints for business
  uniqueness (e.g. one SocialAccount per platform account).
- Avoid N+1 queries; select only needed columns for list views; paginate all lists.
- Multi-country: country-dependent values come from `CountrySettings`, never hard-coded.

## 10. Frontend

- Server Components by default; Client Components only for interactivity.
- Mobile-first, responsive; test at 360px width. Accessible: labels on inputs,
  keyboard navigation, sufficient contrast, alt text (WCAG 2.1 AA).
- All user-facing text in `src/i18n/*.json` — no hard-coded strings in components.
- Forms: same Zod schema on client and server; show field-level errors; disable
  double-submit.
- Every page handles loading, empty, and error states.
- Use shadcn/ui components; don't introduce another UI library.

## 11. Testing

- **Test pyramid:** many unit tests (domain, services with fakes), fewer integration
  tests (services + real PostgreSQL in Docker), a few E2E flows (Playwright).
- Every use case (UC-*) has at least one test; include its ID in the test name:
  `it('UC-R1 blocks request when plan limit reached', ...)`.
- Test edge cases listed in the spec, not just the happy path.
- Security tests: cross-account access, unauthenticated access, rate limits.
- Tests are deterministic: inject a clock, no real network calls (use MockProvider),
  no dependence on test order. Each integration test cleans up its data.
- Arrange–Act–Assert structure; one behaviour per test; descriptive names.
- Coverage target: ≥ 80% lines on `domain/` and `services/`. Coverage is a floor,
  not the goal — meaningful assertions matter more.
- A bug fix starts with a failing test that reproduces the bug.

## 12. Logging and observability

- Structured JSON logs with `requestId`, `userId` (not email), `module`, `action`.
- Log levels: `error` (needs attention), `warn` (unexpected but handled), `info`
  (business events), `debug` (dev only).
- Background jobs log start, finish, duration, counts and failures.
- Report unexpected errors to Sentry with personal data scrubbed.

## 13. Git and commits

- Branch per change: `feat/…`, `fix/…`, `chore/…`, `refactor/…`, `docs/…`.
- Conventional commits: `feat(search): add language filter (FR-5.1)`.
  Reference requirement/use-case IDs where relevant.
- Small, focused commits; each commit builds and passes `npm run check`.
- Never commit: secrets, `.env`, build output, large binaries, real user data.
- Never force-push to `main`. Never rewrite published history.

## 14. Dependencies and configuration

- Prefer the platform and existing dependencies before adding new ones. Each new
  dependency needs a one-line justification in the commit message.
- Pin versions via the lockfile; keep the lockfile committed.
- All configuration via environment variables, validated at startup, documented in
  `.env.example` with a comment per variable.
- Feature flags and tunables (score weights, plan limits, expiry days) live in
  `src/config/`, not scattered through code.

## 15. Documentation

- `README.md`: what it is, setup in < 10 steps, commands, env vars, architecture
  overview, how to add a platform/country/language.
- Keep docs in the same commit as the code change they describe.
- Public interfaces (adapters, service entry points) have doc comments describing
  inputs, outputs and errors.

## 16. Things to avoid (unnecessary complexity)

- Microservices, message brokers, Kubernetes, GraphQL, CQRS/event sourcing, generic
  repository base classes, dependency-injection frameworks, custom state-management
  libraries — none are needed at this stage.
- Premature optimisation or caching without a measured problem.
- Wrapping libraries "in case we switch" — only external services get interfaces.
- Clever one-liners, deep generics, or metaprogramming that hurt readability.
- Building "Later" items from the spec before they are scheduled.

## 17. Definition of done (every task)

- [ ] Meets the requirement/use case, including its edge cases
- [ ] Authorisation checked on the server; input validated
- [ ] Privacy: new personal data covered by export, deletion and retention
- [ ] Tests added/updated; `npm run check` passes; E2E updated if a user flow changed
- [ ] No lint/type suppressions, no `console.log`, no dead code
- [ ] User-facing text in i18n files; loading/empty/error states handled
- [ ] Docs, `.env.example`, `TRACEABILITY.md` updated as needed
- [ ] Summary given: what changed, why, how it was tested, any open questions
