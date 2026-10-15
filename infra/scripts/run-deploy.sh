#!/bin/bash
# Runs /opt/creator-platform/deploy.sh on an environment's server through SSM Run Command
# and waits for it (ADR-009). Used by .github/workflows/deploy.yml; also works by hand with
# operator credentials:   infra/scripts/run-deploy.sh production <image@sha256:digest>
set -euo pipefail

ENVIRONMENT="${1:?usage: run-deploy.sh <staging|production> <image>}"
IMAGE="${2:?usage: run-deploy.sh <staging|production> <image>}"
REGION="${AWS_REGION:-ap-south-1}"
TIMEOUT_SECONDS=900

case "$IMAGE" in
  *@sha256:*) ;;
  *) echo "deploy an image digest (repo@sha256:...), not a tag" >&2; exit 1 ;;
esac

command_id=$(aws ssm send-command --region "$REGION" \
  --document-name AWS-RunShellScript \
  --targets "Key=tag:Deploy,Values=creator-platform-$ENVIRONMENT" \
  --timeout-seconds "$TIMEOUT_SECONDS" \
  --comment "deploy $IMAGE" \
  --parameters "commands=[\"/opt/creator-platform/deploy.sh $IMAGE\"],executionTimeout=[\"$TIMEOUT_SECONDS\"]" \
  --query Command.CommandId --output text)
echo "SSM command $command_id sent to $ENVIRONMENT"

# Wait for the one target to finish (the tag matches exactly one server).
deadline=$((SECONDS + TIMEOUT_SECONDS + 60))
while true; do
  instance_id=$(aws ssm list-command-invocations --region "$REGION" --command-id "$command_id" \
    --query 'CommandInvocations[0].InstanceId' --output text)
  if [ "$instance_id" != "None" ] && [ -n "$instance_id" ]; then
    status=$(aws ssm get-command-invocation --region "$REGION" --command-id "$command_id" \
      --instance-id "$instance_id" --query Status --output text 2> /dev/null || echo Pending)
    case "$status" in
      Success | Failed | Cancelled | TimedOut | Cancelling) break ;;
    esac
  fi
  if [ "$SECONDS" -gt "$deadline" ]; then
    echo "gave up waiting for $command_id" >&2
    exit 1
  fi
  sleep 10
done

aws ssm get-command-invocation --region "$REGION" --command-id "$command_id" \
  --instance-id "$instance_id" --query '[StandardOutputContent, StandardErrorContent]' \
  --output text
echo "deploy to $ENVIRONMENT: $status"
[ "$status" = "Success" ]
