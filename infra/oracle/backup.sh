#!/bin/bash
# Backs up the pilot's database and uploaded files (SR-15), daily from cron (setup.sh):
#   bash infra/oracle/backup.sh
# Keeps the newest 14 in infra/oracle/backups. If BACKUP_UPLOAD_URL is set in server.env (a
# write-only "pre-authenticated request" for an Object Storage bucket in the same region,
# see the runbook), each backup is also uploaded there, so it survives losing the server.
set -euo pipefail
cd "$(dirname "$0")"
compose() { sudo docker compose --env-file server.env "$@"; }
keep=14
stamp="$(date -u +%Y-%m-%dT%H%MZ)"
mkdir -p backups

compose exec -T postgres pg_dump --username creator --dbname creator_platform --format=custom \
  > "backups/database-$stamp.dump"
sudo docker run --rm -v creator-server_files:/data:ro -v "$(pwd)/backups:/backup" alpine:3.22 \
  tar czf "/backup/files-$stamp.tgz" -C /data .
sudo chown "$(id -u):$(id -g)" "backups/files-$stamp.tgz"
chmod 600 "backups/database-$stamp.dump" "backups/files-$stamp.tgz"

upload_url="$(grep '^BACKUP_UPLOAD_URL=' server.env | cut -d= -f2- || true)"
if [ -n "$upload_url" ]; then
  for file in "database-$stamp.dump" "files-$stamp.tgz"; do
    curl -fsS --retry 3 --max-time 900 -T "backups/$file" "${upload_url%/}/$file"
  done
  echo "Uploaded to Object Storage: database-$stamp.dump, files-$stamp.tgz"
fi

for pattern in 'database-*.dump' 'files-*.tgz'; do
  find backups -maxdepth 1 -name "$pattern" -print | sort -r | tail -n +$((keep + 1)) | xargs -r rm -f
done
echo "Backed up to $(pwd)/backups (database-$stamp.dump, files-$stamp.tgz)"
