# ADR-010: Pilot database on the app server

**Status:** accepted · 2026-10-16 · replaces the RDS part of ADR-009

## Context

The product owner asked to cut cloud cost as far as possible for the pilot. In ADR-009 the
managed database (RDS) was about $18 of the ~$50 monthly bill, plus a private network for it.
The pilot's data is small (thousands of rows), and the 4 GB server has room.

## Decision

- PostgreSQL 16 with pgvector runs as a container on the app server, reachable only on the
  containers' internal network. Its data and password live on a separate encrypted EBS disk
  (`/data`), so the server can be replaced without touching the data; OpenTofu refuses to
  delete that disk.
- Backups: `pg_dump` every hour to a private S3 bucket (kept 2 days), the 02:45 IST dump also
  kept 30 days. CloudWatch alarms when a backup is missed for 2 hours or the disk passes
  80%. The server can write backups but not delete them.
- Restore drill (`infra/scripts/restore-drill.sh`) restores the newest dump into a temporary
  database on the server and checks it.

## Consequences

- About **$30/month** for production (server ~$25, disks ~$5, IP ~$4, S3/logs ~$1), plus
  ~$1.50 for the outside uptime check added later (`uptime.tf`); about
  $20 with a 1-year Savings Plan. New AWS accounts' credits cover the first months.
- Recovery point: up to 1 hour of data can be lost (RDS: seconds). Recovery time: minutes
  to restore a dump. Accepted for the pilot (Q-42).
- The database shares CPU and memory with the app; the slow-query log and alarms show when
  that starts to hurt.
- Moving back to RDS later: create the RDS instance, restore the latest dump into it, point
  `DATABASE_URL` at it in deploy.sh. No app changes.
