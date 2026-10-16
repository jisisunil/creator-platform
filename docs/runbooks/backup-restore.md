# Backup and restore (SR-15, NFR-4)

**Targets:** daily automated database backups, kept 30 days, stored encrypted in the India
region (PR-12); a restore test every quarter. Uploaded files (photos, chat attachments) are
backed up with object-storage versioning.

**How (ADR-010):** `backup.sh` on the server dumps the database (`pg_dump`, custom format)
to the private S3 backups bucket every hour at :15. Hourly dumps are kept 2 days; the 02:45
IST dump is also copied to `daily/` and kept 30 days. So at most about an hour of data can be
lost. A missed backup alarms after 2 hours. The server can write backups but not delete
them; an overwritten or deleted dump stays recoverable for 7 days (bucket versioning). The
S3 uploads bucket is versioned: replaced or deleted files stay recoverable for 30 days, then
go (deleted personal data must not live on).

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

## Restore production from a backup

On the server (`aws ssm start-session --target <instance id>`, `sudo -i`,
`cd /opt/creator-platform`):

1. Pick the dump: `aws s3 ls s3://<backups bucket>/hourly/` (or `daily/` for older ones),
   the last one taken before the incident. Download it to `/data/restore.dump`.
2. Stop the app so nothing writes meanwhile: `docker compose stop web worker`.
3. Restore into a fresh database and check it before switching:

   ```sh
   docker compose exec -T postgres createdb --username creator creator_platform_restored
   docker compose exec -T postgres pg_restore --username creator --no-owner      --dbname creator_platform_restored < /data/restore.dump
   ```

4. Swap the databases (keep the old one until you're sure):

   ```sh
   docker compose exec -T postgres psql --username creator --dbname postgres -c      'ALTER DATABASE creator_platform RENAME TO creator_platform_broken' -c      'ALTER DATABASE creator_platform_restored RENAME TO creator_platform'
   ```

5. Redeploy the current image (it applies any newer migrations), then follow "After a
   restore" below. Delete `/data/restore.dump` and, later, `creator_platform_broken`.

If the database disk itself is lost: create a new environment disk (`tofu apply` after
removing the old volume from state), let the first boot start an empty database, deploy,
then restore as above.

## Quarterly restore test

`infra/scripts/restore-drill.sh production` does steps 1–3 and 6 automatically (restores
the newest hourly dump into a temporary `restore_drill` database next to the live one, runs
the checks, prints the time taken and drops it). Steps 4 and 5 remain manual.

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
