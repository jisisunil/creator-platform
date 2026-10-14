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
