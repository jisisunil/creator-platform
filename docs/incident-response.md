# Incident response (SEC-10, SEC-12, PR-13, PRV-10)

A plan for data breaches and leaked secrets. Practise it once a quarter with the backup
restore test. This is an operating checklist, not legal advice; have a lawyer confirm the
notification wording and timelines before launch (X-03).

## Roles

- **Incident lead:** runs the response and keeps the timeline. Default: the founder on call.
- **Technical lead:** contains and investigates.
- **Grievance officer** (X-04): talks to the Data Protection Board and affected users.

## 1. Detect

Signals: monitoring alerts (`opsAlert` emails and `event: "alert"` log lines: failed-login
spikes, unusual export volume, admin actions outside working hours, overdue data requests),
Sentry error spikes, user or partner reports, the cloud provider's security notices.

Open an incident note with the time, the signal and who is involved. Times in IST and UTC.

## 2. Contain (first hour)

- Leaked key or token (SEC-10): rotate it (`AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY`, API keys,
  database password) in the secrets manager and redeploy. Rotating `AUTH_SECRET` signs
  everyone out; rotating `TOKEN_ENCRYPTION_KEY` needs a re-encryption step or creators must
  reconnect their accounts.
- Compromised account: suspend it from the admin console (sessions end at once).
- Compromised admin: remove the admin role in the database, rotate their TOTP, review the
  audit log for their actions (`/admin/audit?actor=<id>`).
- If needed, take the affected feature offline (feature flag or maintenance page).

## 3. Assess (first 24 hours)

- What data, whose, how many people, since when. Use the audit log (kept one year), access
  logs and the database.
- Is it a personal-data breach under the DPDP Act? If unsure, treat it as one.

## 4. Notify (PR-13)

- **Data Protection Board:** without delay, and a full report **within 72 hours** of
  becoming aware: what happened, data and people affected, likely consequences, what was
  done, contact person.
- **Affected users:** promptly, in plain English and Hindi: what happened, what it means
  for them, what we did, what they should do (for example change password), how to reach the
  grievance officer.
- Processors and partners (`docs/processors.md`) if their systems are involved.

## 5. Recover and learn

- Fix the cause, restore from backup if data was damaged (`docs/runbooks/backup-restore.md`).
- Write down within a week: timeline, root cause, what worked, what to change. Add tests or
  alerts for the gap. Keep the record with the incident note.
