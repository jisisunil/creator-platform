#!/bin/bash
# SR-15 / NFR-11 quarterly restore drill (docs/runbooks/backup-restore.md). Restores the
# latest point in time of an environment's database to a temporary instance, checks it from
# the app server, reports how long it took, and deletes the copy. Never touches the source.
#   infra/scripts/restore-drill.sh production
# Needs operator credentials with RDS, SSM and Secrets Manager access in ap-south-1.
set -euo pipefail

ENVIRONMENT="${1:?usage: restore-drill.sh <staging|production>}"
REGION="${AWS_REGION:-ap-south-1}"
SOURCE="creator-platform-$ENVIRONMENT"
DRILL="$SOURCE-restore-drill"
started=$SECONDS

source_json=$(aws rds describe-db-instances --region "$REGION" --db-instance-identifier "$SOURCE" \
  --query 'DBInstances[0].{group:DBSubnetGroup.DBSubnetGroupName,sg:VpcSecurityGroups[0].VpcSecurityGroupId,params:DBParameterGroups[0].DBParameterGroupName,secret:MasterUserSecret.SecretArn}' \
  --output json)
field() { python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])" <<< "$source_json"; }

cleanup() {
  echo "deleting $DRILL"
  aws rds delete-db-instance --region "$REGION" --db-instance-identifier "$DRILL" \
    --skip-final-snapshot --delete-automated-backups > /dev/null 2>&1 || true
}
trap cleanup EXIT

echo "restoring the latest point in time of $SOURCE into $DRILL"
aws rds restore-db-instance-to-point-in-time --region "$REGION" \
  --source-db-instance-identifier "$SOURCE" --target-db-instance-identifier "$DRILL" \
  --use-latest-restorable-time --db-instance-class db.t4g.micro --no-multi-az \
  --db-subnet-group-name "$(field group)" --vpc-security-group-ids "$(field sg)" \
  --db-parameter-group-name "$(field params)" --no-publicly-accessible \
  --no-deletion-protection > /dev/null
aws rds wait db-instance-available --region "$REGION" --db-instance-identifier "$DRILL"
endpoint=$(aws rds describe-db-instances --region "$REGION" --db-instance-identifier "$DRILL" \
  --query 'DBInstances[0].Endpoint.Address' --output text)
echo "restored in $(((SECONDS - started) / 60)) minutes: $endpoint"

# The copy keeps the source's master password (the managed secret does not rotate, ADR-009).
# Checks run on the app server, the only machine the database accepts connections from.
check_sql="SELECT (SELECT count(*) FROM \"_prisma_migrations\") AS migrations,
  (SELECT count(*) FROM \"User\") AS users, (SELECT count(*) FROM \"CreatorProfile\") AS creators,
  (SELECT count(*) FROM \"CollabRequest\") AS requests, (SELECT count(*) FROM \"Deal\") AS deals,
  (SELECT max(\"createdAt\") FROM \"AuditEvent\") AS latest_event;"
remote="secret=\$(aws secretsmanager get-secret-value --region $REGION --secret-id $(field secret) --query SecretString --output text)
export PGPASSWORD=\$(jq -r .password <<< \"\$secret\")
docker run --rm -e PGPASSWORD postgres:16-alpine psql \"host=$endpoint dbname=creator_platform user=\$(jq -r .username <<< \"\$secret\") sslmode=require\" -c '$check_sql'"
command_id=$(aws ssm send-command --region "$REGION" --document-name AWS-RunShellScript \
  --targets "Key=tag:Deploy,Values=creator-platform-$ENVIRONMENT" \
  --parameters "$(python3 -c 'import json,sys; print(json.dumps({"commands": [sys.argv[1]]}))' "$remote")" \
  --query Command.CommandId --output text)
sleep 20
instance_id=$(aws ssm list-command-invocations --region "$REGION" --command-id "$command_id" \
  --query 'CommandInvocations[0].InstanceId' --output text)
aws ssm wait command-executed --region "$REGION" --command-id "$command_id" --instance-id "$instance_id" || true
aws ssm get-command-invocation --region "$REGION" --command-id "$command_id" \
  --instance-id "$instance_id" --query '[Status, StandardOutputContent, StandardErrorContent]' --output text

echo "drill finished in $(((SECONDS - started) / 60)) minutes (record this as the recovery time)"
