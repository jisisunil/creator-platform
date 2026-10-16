#!/bin/bash
# SR-15 / NFR-11 quarterly restore drill (docs/runbooks/backup-restore.md). On the
# environment's server: downloads the newest backup from S3, restores it into a temporary
# database next to the live one, checks it, reports how long it took, and drops it. The live
# database is never touched.
#   infra/scripts/restore-drill.sh production
# Needs operator credentials with SSM access in ap-south-1.
set -euo pipefail

ENVIRONMENT="${1:?usage: restore-drill.sh <staging|production>}"
REGION="${AWS_REGION:-ap-south-1}"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="creator-platform-$ENVIRONMENT-backups-$ACCOUNT"

remote=$(cat <<SCRIPT
set -euo pipefail
cd /opt/creator-platform
started=\$SECONDS
latest=\$(aws s3 ls "s3://$BUCKET/hourly/" --region "$REGION" | sort | tail -1 | awk '{print \$4}')
echo "restoring \$latest"
aws s3 cp "s3://$BUCKET/hourly/\$latest" /data/restore-drill.dump --region "$REGION" --only-show-errors
trap 'rm -f /data/restore-drill.dump; docker compose exec -T postgres dropdb --username creator --if-exists restore_drill' EXIT
docker compose exec -T postgres createdb --username creator restore_drill
docker compose exec -T postgres pg_restore --username creator --dbname restore_drill --no-owner < /data/restore-drill.dump
docker compose exec -T postgres psql --username creator --dbname restore_drill -c 'SELECT
  (SELECT count(*) FROM "_prisma_migrations") AS migrations,
  (SELECT count(*) FROM "User") AS users,
  (SELECT count(*) FROM "CreatorProfile") AS creators,
  (SELECT count(*) FROM "CollabRequest") AS requests,
  (SELECT count(*) FROM "Deal") AS deals,
  (SELECT max("createdAt") FROM "AuditEvent") AS latest_event;'
echo "restored and checked in \$((SECONDS - started)) seconds (record this as the recovery time)"
SCRIPT
)

command_id=$(aws ssm send-command --region "$REGION" --document-name AWS-RunShellScript \
  --targets "Key=tag:Deploy,Values=creator-platform-$ENVIRONMENT" \
  --parameters "$(python3 -c 'import json,sys; print(json.dumps({"commands": [sys.argv[1]]}))' "$remote")" \
  --query Command.CommandId --output text)
echo "SSM command $command_id sent to $ENVIRONMENT"
sleep 15
instance_id=$(aws ssm list-command-invocations --region "$REGION" --command-id "$command_id" \
  --query 'CommandInvocations[0].InstanceId' --output text)
aws ssm wait command-executed --region "$REGION" --command-id "$command_id" \
  --instance-id "$instance_id" || true
aws ssm get-command-invocation --region "$REGION" --command-id "$command_id" \
  --instance-id "$instance_id" --query '[Status, StandardOutputContent, StandardErrorContent]' \
  --output text
