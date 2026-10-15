# Backup and restore (SR-15, NFR-4)

**Targets:** daily automated database backups, kept 30 days, stored encrypted in the India
region (PR-12); a restore test every quarter. Uploaded files (photos, chat attachments) are
backed up with object-storage versioning.

**How (ADR-009):** RDS PostgreSQL in Mumbai with automated backups kept 30 days and
point-in-time recovery to any second in that window (backup window 03:00–03:30 IST).
Production has deletion protection and keeps a final snapshot if the instance is ever
deleted. The S3 uploads bucket is versioned: replaced or deleted files stay recoverable for
30 days, then go (deleted personal data must not live on).

## What must be restorable

- PostgreSQL: all application tables and the `pgboss` job schema.
- Object storage: `photos/` and `attachments/` keys.
- Secrets are **not** in backups; they live in the secrets manager. Without the same
  `TOKEN_ENCRYPTION_KEY`, restored social tokens and TOTP secrets can't be decrypted.

## Local or manual backup

```sh
# Backup (custom format, compressed)
pg_dump --format=custom --no-owner --file=creator_platform_$(date +%F).dump "$DATABASE_DIRECT_URL"

# Restore into an empty database
createdb creator_platform_restore
pg_restore --no-owner --dbname=creator_platform_restore creator_platform_YYYY-MM-DD.dump
```

## Restore production to a point in time

1. In RDS, **Restore to point in time** for `creator-platform-production`, choosing the time
   just before the incident, into a new instance (same subnet group, security group and
   parameter group). The original stays untouched.
2. Check the restored copy (counts, latest records) as in the drill below.
3. Switch over: rename the broken instance (e.g. `creator-platform-production-broken`), then
   rename the restored one to `creator-platform-production`. Its endpoint name is derived
   from the identifier, so the app's connection string stays valid. Hand it to OpenTofu:
   `tofu state rm module.environment.aws_db_instance.main`, then
   `tofu import module.environment.aws_db_instance.main creator-platform-production`, then
   `tofu apply`: it switches the copy back to an RDS-managed password (a new secret), so
   redeploy straight after. Keep the broken instance until you're sure, then delete it.
4. Follow "After a restore" below.

## Quarterly restore test

`infra/scripts/restore-drill.sh production` does steps 1–3 and 6 automatically (restores
the latest point in time to `creator-platform-production-restore-drill`, runs the checks from
the app server, prints the time taken and deletes the copy). Steps 4 and 5 remain manual.

1. Restore the latest backup into a separate, private database (never production).
2. Run `npx prisma migrate status` against it: all migrations applied.
3. Spot-check: counts of users, creators, requests and deals look right; a known record opens.
4. Start the app against it in an isolated environment and sign in with a test account.
5. Note the time taken (the recovery time objective) and anything that failed.
6. Delete the restored copy. Record the test in the operations log.

## After a restore

- Re-run `npx prisma migrate deploy` if the backup predates a release.
- Data deleted after the backup was taken (account deletions, retention) must be deleted
  again: re-run the deletion and retention jobs before opening the app to users, so a
  restore never brings back data people asked us to delete.
