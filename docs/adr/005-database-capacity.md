# ADR-005: Database sized for production traffic

**Status:** accepted · 2026-10-13

## Context

NFR-4: handle 10× first-year volume by adding servers, not rewriting. Year one is about 50,000
creators and 2,000 brands, so the design target is about 500,000 creators and 20,000 brands.
NFR-1: 95% of searches under 1 second. One PostgreSQL 16 database serves the web app and the
worker.

## Expected volume at 10× year one

| Table                                        | Growth                                                    | Size estimate | Approach                                                                                                                                                                        |
| -------------------------------------------- | --------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StatsSnapshot`                              | ~1.5 accounts × 500k creators × 365 days ≈ 270M rows/year | Largest table | Unique `(socialAccountId, capturedOn)` index serves every read. Snapshots over 2 years old are aggregated (data inventory). Range-partition by month when it passes ~100M rows. |
| `AuditEvent`                                 | Sign-ins and security events, a few million/year          | Medium        | Indexed by time; deleted after 1 year (SR-13).                                                                                                                                  |
| `Message` (phase e)                          | Chat at scale                                             | Medium–large  | `(threadId, createdAt)` index; keyset pagination.                                                                                                                               |
| `CreatorProfile`                             | 500k rows                                                 | Small         | Denormalised search columns, each indexed; full-text and trigram indexes for name/bio (phase d).                                                                                |
| `RateLimitCounter`, `Session`, `EmailOutbox` | Churn, not growth                                         | Small         | Purged daily by the retention job.                                                                                                                                              |

## Decision

- **Bounded pools per process**, configured by env: `DATABASE_POOL_MAX` (default 10),
  `DATABASE_STATEMENT_TIMEOUT_MS` (15 s) and `DATABASE_CONNECT_TIMEOUT_MS` (5 s). A slow query is
  cancelled rather than holding a connection. The web app's job sender uses at most 2
  connections; the worker's queue uses 4.
- **PgBouncer-ready:** `DATABASE_URL` may point at PgBouncer (transaction mode) for the web app.
  Migrations and pg-boss, which need session-level advisory locks, use `DATABASE_DIRECT_URL`.
- **Query rules** (CLAUDE.md §9): an index for every foreign key and every search filter or
  sort, list views select only needed columns, all lists paginate (keyset pagination for large
  feeds), no N+1 queries.
- **Hot reads denormalised:** search reads `CreatorProfile` columns (score, tier, followers,
  engagement), recomputed after each refresh, never joins snapshots at query time.
- **Phase h:** load test with 50,000 seeded creators and `EXPLAIN ANALYZE` on the search query
  shapes; fix any plan that misses an index.
- **Phase i:** managed PostgreSQL 16 with pgvector in Mumbai/Hyderabad, sized from the load
  test; point-in-time recovery and daily backups (SR-15, NFR-11); PgBouncer in front of the web
  tier; a read replica for search only if the load test shows a need.

## Consequences

- Connection count = (web instances × pool) + worker pools; it must stay under the server's
  `max_connections`. PgBouncer removes that limit for the web tier.
- Partitioning `StatsSnapshot` later is a planned migration, not a rewrite.

## Measured (2026-10-14, phase d)

50,000 fake creators (year-one volume) in a scratch database, 15 typical searches × 10 runs
each, on a developer laptop under memory pressure, timing the result query plus the total
count:

| Search                                       | p95    |
| -------------------------------------------- | ------ |
| No filters, sorted by score (counts all 50k) | 190 ms |
| Audience mostly women + platform             | 169 ms |
| State + category                             | 149 ms |
| Sort by growth / deep page 50                | 150 ms |
| Text search in bio ("biryani")               | 88 ms  |
| City + language                              | 103 ms |
| Everything combined / no results             | 35 ms  |

Every case is well under the NFR-1 target (1 s at p95). The slowest are unfiltered searches,
where the total count scans every searchable creator; at 10× volume (500k) that grows roughly
linearly, so phase h repeats this at 500k and, if needed, caps or estimates the total
("10,000+ creators") instead of counting exactly.

## Measured (2026-10-15, phase h): 500,000 creators

`npm run perf:search -- 500000` fills a scratch database (`creator_platform_perf`) with
500,000 fake creators (10× year one) and times the real search repository: one untimed
warm-up, then 20 timed runs per search. Developer laptop, PostgreSQL 16 in Docker with
default settings (128 MB `shared_buffers`).

The first run **failed NFR-1** (worst p95 4.3 s). Causes and fixes:

| Problem                                                                                               | Fix                                                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Sorting by score used `DESC NULLS LAST`, which no index matched, so every search sorted all 500k rows | One index per sort, `(countryCode, isSearchable, <metric> DESC, id)`, and an `ORDER BY` that matches it exactly               |
| The exact total count visited every match (1.5–2 s for broad searches)                                | Count only what a brand can page through: 50 pages × 24 = 1,200; more shows as "1,200+"                                       |
| Prisma adds `ORDER BY id` to any `take`, so a capped count walked the primary key                     | One query fetches the ids in result order (up to 1,201) for count and paging; the page's cards are then loaded by id          |
| `city ILIKE …` could not use the location index                                                       | `city` is `citext`; equality ignores case and uses `(countryCode, stateCode, city)`                                           |
| Audience and platform filters scanned 1M audience rows / fetched account rows                         | Indexes `AudienceSegment(dimension, bucket, sharePermille, socialAccountId)` and `SocialAccount(creatorId, platform, status)` |

After the fixes (two runs, worst p95 428 ms and 491 ms):

| Search                               | p50    | p95    |
| ------------------------------------ | ------ | ------ |
| No filters, sorted by score          | 35 ms  | 42 ms  |
| Audience mostly women + Instagram    | 276 ms | 340 ms |
| State + category                     | 324 ms | 491 ms |
| Sort by growth, page 50              | 34 ms  | 45 ms  |
| Text search in bio ("biryani")       | 92 ms  | 129 ms |
| City + language                      | 68 ms  | 75 ms  |
| Followers 10k–100k + engagement ≥ 3% | 36 ms  | 39 ms  |
| Verified + open, sorted by followers | 36 ms  | 42 ms  |
| Everything combined (no results)     | 74 ms  | 100 ms |

**NFR-1 passes at 10× year-one volume** on laptop hardware. Without the warm-up, single
cold-cache runs reached 1.8 s; a production server with `shared_buffers` sized to hold the
`CreatorProfile` table and its indexes (~1.2 GB at 500k) avoids that. Phase i sizes the
database from these numbers. Synthetic data correlates columns in ways real data won't, so
repeat the test with production-shaped data before launch traffic grows.

Two lessons for future schema changes:

- Prisma cannot express `NULLS LAST` or expression indexes. Hand-edited index details in a
  migration survive only if `prisma migrate diff` stays empty afterwards (it does for the
  growth index). An index Prisma does not know about at all is dropped by the next
  `migrate dev`: that already happened to the pgvector HNSW index in the phase d migration
  (see OPEN-QUESTIONS Q-33).
- Measure with the real repository code: the plan Prisma's SQL gets can differ from a
  hand-written equivalent.
