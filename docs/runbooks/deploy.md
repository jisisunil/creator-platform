# Hosting and deploys (ADR-009)

AWS Mumbai (`ap-south-1`), defined with OpenTofu in `infra/`. One server per environment runs
Caddy, web, worker, ClamAV and PostgreSQL with Docker Compose (the database on its own
encrypted disk, backed up hourly to S3, ADR-010); S3 holds
uploads; SES sends email. Deploys run from GitHub Actions; nobody needs SSH.

```
infra/bootstrap                 once per AWS account: state bucket, image repository, CI roles
infra/environments/staging      staging stack (may be destroyed between releases)
infra/environments/production   production stack
infra/modules/environment       what each environment contains
infra/host                      compose.yaml + Caddyfile (shipped inside the image)
infra/scripts                   run-deploy.sh (used by CI), restore-drill.sh
```

## You need

- An AWS account (billing alerts on) and an administrator to run OpenTofu, with the AWS CLI.
- OpenTofu 1.10+ (`tofu`). The provider lock files are committed.
- The product domain (X-07), with access to its DNS.
- The GitHub repository, with Actions enabled.

## 1. Bootstrap (once per account)

```sh
cd infra/bootstrap
tofu init
tofu apply -var github_repository=OWNER/REPO
```

Keep the outputs. Its state is local (`terraform.tfstate`, git-ignored): store it safely,
for example in a password manager. Everything in it can be re-imported if lost.

In GitHub, **Settings → Secrets and variables → Actions → Variables**:

| Variable                 | Value                                                        |
| ------------------------ | ------------------------------------------------------------ |
| `AWS_BUILD_ROLE_ARN`     | output `github_build_role_arn`                               |
| `ECR_REPOSITORY`         | output `ecr_repository_url`                                  |
| `STAGING_ENABLED`        | `true` while staging exists, otherwise `false`               |
| `NEXT_PUBLIC_SENTRY_DSN` | optional; the browser's Sentry DSN (compiled into the image) |

**Settings → Environments:** create `staging` and `production`, each with the variable
`AWS_DEPLOY_ROLE_ARN` (output `github_deploy_role_arns`). Give `production` required
reviewers: the deploy waits for an approval.

## 2. Create an environment

```sh
cd infra/environments/production          # or staging
cp production.tfvars.example production.tfvars   # fill in; no secrets in this file
tofu init -backend-config="bucket=<bootstrap output state_bucket>"
tofu apply -var-file=production.tfvars
```

Then, from the outputs:

1. **DNS:** an `A` record for the domain → `server_ip`. Caddy gets the certificate by itself.
2. **Email:** add the `email_dkim_records` CNAMEs. In SES, request production access (new
   accounts can only email verified addresses). Create SMTP credentials in SES (they are an
   IAM user's keys; the console shows them once).
3. **Alarms:** confirm the two subscription emails AWS sends to `alert_email` (alarms from
   Mumbai, and the uptime alarm from us-east-1). The `backup-missed` alarm stays
   on until the first deploy has started the database; that's expected.
4. **Cost tag:** in Billing → Cost allocation tags, activate `Environment` (once per account)
   so each environment's budget only counts its own resources.
5. **Secrets:** set every name in `secret_parameters_to_set`:

   ```sh
   put() { aws ssm put-parameter --overwrite --type SecureString --name "/creator-platform/production/$1" --value "$2"; }
   put AUTH_SECRET "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
   put TOKEN_ENCRYPTION_KEY "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
   put SMTP_URL "smtp://<url-encoded user>:<url-encoded password>@email-smtp.ap-south-1.amazonaws.com:587"
   put TURNSTILE_SECRET_KEY "..."      # Cloudflare Turnstile
   put AUTH_GOOGLE_SECRET "..."        # Google OAuth client (YouTube ownership + sign-in)
   put YOUTUBE_API_KEY "..."
   put INSTAGRAM_APP_SECRET "..."
   put SENTRY_DSN "unset"              # or the server DSN
   ```

   Keep `TOKEN_ENCRYPTION_KEY` safe as well: restored backups can't decrypt social tokens or
   2FA secrets without it. Until every value is set, deploys stop with a list of what's missing.

## 3. Deploy

Every push to `main` that passes CI builds one image, deploys it to staging (if enabled),
then waits for a production approval and deploys **the same image** there. A deploy:
reads configuration → pulls the image → applies migrations → loads reference data (plans,
countries, privacy notices from `src/config`) → restarts the containers → waits for health.

- **Watch it:** the Deploy workflow's log shows the server's output.
- **Roll back:** re-run the production job of an earlier successful Deploy run. Migrations
  are never rolled back, which is why schema changes are backward compatible (CLAUDE.md §9).
- **By hand** (with operator credentials):
  `infra/scripts/run-deploy.sh production <account>.dkr.ecr.ap-south-1.amazonaws.com/creator-platform@sha256:...`

## 4. First admin

```sh
aws ssm start-session --target <server_instance_id>
sudo -i
cd /opt/creator-platform
docker compose run --rm web node_modules/.bin/tsx scripts/ops/create-admin.ts ops@example.in "Ops Name"
```

Then on the site: "Forgot password" for that address, set a password, sign in and enrol the
authenticator app (admins always need 2FA).

## Everyday operations

- **Logs:** CloudWatch Logs, group `/creator-platform/<environment>`, one stream per
  container. Kept 30 days.
- **Backups:** hourly to the `backups_bucket` (kept 2 days; the 02:45 IST one kept 30 days).
  Restores and the quarterly drill: `docs/runbooks/backup-restore.md`.
- **Shell on the server:** `aws ssm start-session --target <instance id>`; every session is
  logged in Systems Manager. Never edit files in `/opt/creator-platform`: deploys replace them.
- **Change a secret:** `put …` as above, then redeploy (re-run the latest Deploy job).
- **Database shell:** `docker compose exec postgres psql --username creator creator_platform`
  (on the server, in `/opt/creator-platform`). Read-only queries only; changes go through
  migrations.
- **Bigger server:** change `server_instance_type` in the environment and `tofu apply`
  (the server restarts; a few minutes of downtime, plan it). **Bigger database disk:**
  raise `data_volume_gb`, `tofu apply`, then on the server `xfs_growfs /data`.
- **Staging off:** the database disk is protected against deletion, so remove it from
  OpenTofu first: `tofu state rm module.environment.aws_ebs_volume.data module.environment.aws_volume_attachment.data`,
  then `tofu destroy -var-file=staging.tfvars`, delete the `creator-platform-staging-data`
  volume in the EC2 console, and set `STAGING_ENABLED=false`. Staging holds only test data (SR-17).
- **New server image (Amazon Linux update):** `tofu apply -replace=module.environment.aws_instance.server`,
  then redeploy. The new server mounts the same database disk; everything else comes from
  the image and the parameters. Expect a few minutes of downtime.

## Alarms and what to do

| Alarm                | Meaning                                                                                 | First step                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `site-down`          | `https://<domain>/api/health` failed for 2 minutes (checked from several AWS locations) | Check the server and its containers (`docker compose ps`); `server-*` alarms; then CloudWatch Logs    |
| `app-alert`          | The app's monitoring raised an alert                                                    | Read the alert email from the app; `docs/incident-response.md`                                        |
| `app-errors`         | 10+ errors in 5 minutes                                                                 | CloudWatch Logs, filter `level = "error"`; Sentry                                                     |
| `server-recover`     | AWS hardware failure; recovery in progress                                              | Wait 10 minutes, check the site                                                                       |
| `server-unhealthy`   | The operating system stopped responding                                                 | AWS reboots it; if it repeats, check memory in the logs                                               |
| `server-cpu-credits` | The server is about to be throttled                                                     | Check what's busy; consider a bigger instance                                                         |
| `backup-missed`      | No database backup for 2 hours                                                          | On the server: `journalctl -u creator-platform-backup`; run `/opt/creator-platform/backup.sh` by hand |
| `data-disk`          | Database disk over 80% full                                                             | Raise `data_volume_gb`, `tofu apply`, `xfs_growfs /data`                                              |
| Budget email         | Spend over 80% / forecast over 100%                                                     | Cost Explorer by service; NFR-13                                                                      |
