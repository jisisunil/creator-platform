# Closed pilot on your own computer (no cloud, no sign-ups)

For a first pilot with 5–10 invited people, without registering anything new: the whole
platform runs on your computer with Docker, and a free Cloudflare "quick tunnel" (no
account) gives it a public `https://….trycloudflare.com` address. Email goes out through
your own Gmail. When the pilot outgrows this, move to the cloud setup in `deploy.md`.

**What this mode does differently** (`APP_ENV=pilot`, set in `infra/laptop/compose.yaml`):

- **Invite-only:** only the emails in `SIGNUP_ALLOWLIST` can create accounts. The privacy
  notice is still a draft and there is no CAPTCHA, so strangers must not get in.
- **No YouTube or Instagram login** (those need Google and Meta apps): creators list their
  channel or profile as **self-reported**. Brands see "self-reported, not verified" with a
  link to check; self-reported accounts give no score, tier or follower filters (Q-43).
- **Never demo data:** the demo seed refuses to run in a pilot.
- Uploads are still scanned for malware; passwords are still checked against known breaches.

**Limits to accept:** the computer must stay on, awake and online; the public address
changes whenever the tunnel restarts (after a reboot or `stop.ps1`); Cloudflare's quick
tunnels are meant for testing, so keep the pilot small. Your data never leaves this
computer except as email (Gmail) and through the tunnel (Cloudflare); both are listed in
`docs/processors.md`.

## You need

- Docker Desktop, running.
- This repository on the computer.
- A Gmail account with 2-Step Verification, for sending email.

## 1. First start

In PowerShell, from the repository folder:

```powershell
powershell -ExecutionPolicy Bypass -File infra\laptop\start.ps1
```

The first run creates `infra\laptop\pilot.env` with fresh secrets and stops. Open it and
replace every `REPLACE_ME`:

- **Gmail:** at myaccount.google.com → Security → 2-Step Verification → **App passwords**,
  create one. In `SMTP_URL` write your address with `%40` instead of `@`, and the 16-letter
  password without spaces, e.g. `smtps://asha.k%40gmail.com:abcdabcdabcdabcd@smtp.gmail.com:465`.
- **`SIGNUP_ALLOWLIST`:** every participant's email, comma-separated.

Keep `pilot.env` private and backed up: it holds the database password and the key that
protects two-factor secrets.

Run `start.ps1` again. The first build takes several minutes. At the end it prints:

```
The pilot is running at: https://some-random-words.trycloudflare.com
```

## 2. Your admin account

```powershell
cd infra\laptop
docker compose --env-file pilot.env run --rm web node_modules/.bin/tsx scripts/ops/create-admin.ts you@gmail.com "Your Name"
```

Then on the site: **Forgot password** with that address, set a password from the email,
sign in and set up an authenticator app (admins always need two-factor sign-in).

## 3. Invite people

Send each participant the address and ask them to sign up with the email you listed. To
add someone later: add their email to `SIGNUP_ALLOWLIST` and run `start.ps1` again.

## Every day

- **Backups:** `powershell -ExecutionPolicy Bypass -File infra\laptop\backup.ps1` saves the
  database and uploads to `infra\laptop\backups` (keeps 14). Schedule it daily: Task
  Scheduler → Create Basic Task → Daily → Start a program `powershell.exe` with arguments
  `-ExecutionPolicy Bypass -File "<repo>\infra\laptop\backup.ps1"`. Copy the backups and
  `pilot.env` off the computer now and then (a USB drive or your own cloud storage).
- **Keep it awake:** Settings → System → Power → Screen and sleep → "Never" while plugged in.
- **After a restart or a new address:** run `start.ps1` again and send people the new
  address (the old one stops working). Data is kept.
- **Logs:** `docker compose --env-file pilot.env logs -f web worker` (in `infra\laptop`).
- **Stop:** `stop.ps1` (data is kept).

## Restore a backup

In `infra\laptop`, with the pilot running:

```powershell
docker compose --env-file pilot.env stop web worker
docker compose --env-file pilot.env cp backups\database-<time>.dump postgres:/tmp/restore.dump
docker compose --env-file pilot.env exec postgres dropdb --username creator creator_platform
docker compose --env-file pilot.env exec postgres createdb --username creator creator_platform
docker compose --env-file pilot.env exec postgres pg_restore --username creator --no-owner --dbname creator_platform /tmp/restore.dump
docker run --rm -v creator-pilot_files:/data -v "${PWD}\backups:/backup" alpine:3.22 tar xzf /backup/files-<time>.tgz -C /data
```

Then run `start.ps1`. Deleted accounts' data must not come back: see "After a restore" in
`backup-restore.md`.

## End the pilot or start over

`docker compose --env-file pilot.env down -v` deletes **all** pilot data (database and
uploads). Take a backup first if you want to keep anything.
