# Backup and restore (SR-15, NFR-4)

**Targets:** daily automated database backups, kept 30 days, stored encrypted in the India
region (PR-12); a restore test every quarter. Uploaded files (photos, chat attachments) are
backed up with object-storage versioning. The managed-database specifics (provider, point-in-
time recovery window) are filled in during phase i when the cloud provider is chosen (X-06).

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

## Quarterly restore test

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
