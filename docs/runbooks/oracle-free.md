# Running the pilot on Oracle Cloud's free tier, in India (ADR-014)

One free server in Oracle's Mumbai or Hyderabad data centre runs everything: database,
malware scanner, app, worker, and Caddy for HTTPS on your own domain. It costs ₹0 as long as
you stay within Oracle's "Always Free" limits, which this setup does. The pilot rules are the
same as on the laptop (`APP_ENV=pilot`): invite-only, self-reported social accounts, direct
payments.

You need: a card for Oracle's sign-up check (a small refundable hold, no charge), your
domain, a Gmail account with 2-Step Verification, and about an hour.

## 1. Oracle account

1. Sign up at oracle.com/cloud/free.
2. **Home region: India West (Mumbai) or India South (Hyderabad).** This can't be changed
   later, and free resources exist only in the home region.
3. After the account is ready: Billing → **Upgrade to Pay As You Go**. Free resources stay
   free, and Oracle no longer reclaims "idle" free servers (a quiet pilot can look idle).
   Then Billing → Budgets → create a budget of ₹100 with an alert at 1%, so any charge at
   all emails you.

## 2. The server

Compute → Instances → **Create instance**:

- **Image:** Canonical Ubuntu 24.04 (the aarch64 / ARM build).
- **Shape:** Ampere → `VM.Standard.A1.Flex`, **4 OCPUs, 24 GB memory** (the whole free
  allowance).
- **Networking:** create a new virtual cloud network with a public subnet; **assign a public
  IPv4 address**.
- **SSH keys:** "Generate a key pair for me" and download the private key. Keep it safe.
- **Boot volume:** 100 GB.

"Out of capacity" is common for free ARM servers. The easy way round is to let Cloud Shell
(console, top right `>_`) keep trying: download and run `infra/oracle/launch-retry.sh` (its
header has the two commands). It also creates the network if it's missing (VCN, internet
gateway, public subnet, ports 22/80/443), so it can replace this whole step and step 3.

Note the server's **public IP address** from the instance page.

## 3. Open ports 80 and 443 in Oracle's network

Skip this if `launch-retry.sh` created the server. Otherwise: instance page → the subnet → its
**Default Security List** → **Add Ingress Rules**, twice:
source `0.0.0.0/0`, TCP, destination port `80`; then the same for `443`. (Port 22 for SSH is
already open.)

## 4. Point your domain at the server

At your domain registrar's DNS settings for **collabmigo.in**, add two records:

| Type  | Name / host           | Value                  |
| ----- | --------------------- | ---------------------- |
| A     | `@` (the bare domain) | the server's public IP |
| CNAME | `www`                 | `collabmigo.in`        |

Remove any existing A record for `@` or `www` (registrars often add a "parking" one). It can
take a few minutes to an hour to work everywhere. The site lives at https://collabmigo.in;
www.collabmigo.in redirects there.

## 5. Set up

From your computer (Windows PowerShell works):

```
ssh -i path\to\private.key ubuntu@<public IP>
```

On the server:

```
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jisisunil/creator-platform.git
cd creator-platform
bash infra/oracle/setup.sh
```

The first run installs Docker, opens the server's own firewall for 80/443, creates
`infra/oracle/server.env` with fresh secrets, and stops. Fill it in:

```
nano infra/oracle/server.env
```

- `DOMAIN`: `collabmigo.in` (without `https://` or `www`).
- Gmail: create an app password (myaccount.google.com → Security → 2-Step Verification →
  App passwords). In `SMTP_URL`, write the `@` of your address as `%40` and the 16-letter
  password without spaces.
- `SIGNUP_ALLOWLIST`: every participant's email, comma-separated.

Save (Ctrl+O, Enter, Ctrl+X) and run `bash infra/oracle/setup.sh` again. The first build takes
10–15 minutes. At the end it prints `The pilot is running at: https://<your domain>`.

**Copy `server.env` somewhere safe** (a password manager): it holds the database password
and the key that protects two-factor secrets.

## 6. Your admin account

```
cd ~/creator-platform/infra/oracle
sudo docker compose --env-file server.env run --rm web node_modules/.bin/tsx scripts/ops/create-admin.ts you@gmail.com "Your Name"
```

Then on the site: **Forgot password** with that address, set a password from the email,
sign in and set up an authenticator app (admins always need two-factor sign-in).

## 7. Off-server backups (recommended)

Backups run daily at 02:30 and the newest 14 stay in `infra/oracle/backups` on the server.
To keep a copy that survives losing the server, use Oracle's free Object Storage (20 GB):

1. Storage → Buckets → **Create bucket** (private, in your home region).
2. The bucket → **Pre-Authenticated Requests** → create one: target **Bucket**, access
   **Permit object writes**, expiry a year ahead (put a reminder in your calendar).
3. Copy the URL (it ends in `/o/`) into `BACKUP_UPLOAD_URL` in `server.env`, then test:
   `bash infra/oracle/backup.sh`.

The URL lets anyone who has it upload (not read) files: keep it as secret as `server.env`.

## Every day

- **Invite someone:** add their email to `SIGNUP_ALLOWLIST` in `server.env`, then
  `bash infra/oracle/setup.sh`.
- **Update to the latest code:** `bash infra/oracle/update.sh` (backs up, pulls, rebuilds,
  migrates, restarts).
- **Logs:** `cd infra/oracle && sudo docker compose --env-file server.env logs -f web worker`.
- **After a server restart:** nothing to do; everything starts on its own.

## Restore a backup

In `infra/oracle`:

```
sudo docker compose --env-file server.env stop web worker
sudo docker compose --env-file server.env cp backups/database-<time>.dump postgres:/tmp/restore.dump
sudo docker compose --env-file server.env exec postgres dropdb --username creator creator_platform
sudo docker compose --env-file server.env exec postgres createdb --username creator creator_platform
sudo docker compose --env-file server.env exec postgres pg_restore --username creator --no-owner --dbname creator_platform /tmp/restore.dump
sudo docker run --rm -v creator-server_files:/data -v "$PWD/backups:/backup" alpine:3.22 tar xzf /backup/files-<time>.tgz -C /data
bash setup.sh
```

Deleted accounts' data must not come back: see "After a restore" in `backup-restore.md`.
