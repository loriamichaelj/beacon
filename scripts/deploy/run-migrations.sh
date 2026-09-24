#!/usr/bin/env bash
# Run `alembic upgrade head` for a release, inside the VPC (design §7.1.2).
#
#   run-migrations.sh <version>
#
# RDS is private, so the migration runs on a short-lived "migrator" instance
# launched from the environment's own launch template (same AMI, security
# group, and instance role; not in the ASG or target group). SSM Run Command
# executes /opt/beacon/migrate.sh on it (baked into the AMI), and the instance
# is always terminated afterwards, whether the migration succeeded or not.
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

version="${1:?usage: run-migrations.sh <version>}"

read -r launch_template subnets < <(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "${ASG_NAME}" \
  --query 'AutoScalingGroups[0].[LaunchTemplate.LaunchTemplateId, VPCZoneIdentifier]' --output text)
subnet="${subnets%%,*}"

# Tags satisfy the deploy role's tag conditions and let cleanup find strays.
tags="{Key=Name,Value=${BASE}-migrator},{Key=Project,Value=${NAME_PREFIX}},{Key=Environment,Value=${ENVIRONMENT}},{Key=Role,Value=migrator},{Key=ManagedBy,Value=deploy.yml}"

log "launching migrator from ${launch_template} in ${subnet}"
instance_id="$(aws ec2 run-instances \
  --launch-template "LaunchTemplateId=${launch_template},Version=\$Latest" \
  --subnet-id "${subnet}" \
  --count 1 \
  --instance-initiated-shutdown-behavior terminate \
  --tag-specifications "ResourceType=instance,Tags=[${tags}]" "ResourceType=volume,Tags=[${tags}]" \
  --query 'Instances[0].InstanceId' --output text)"
log "migrator: ${instance_id}"

terminate() {
  log "terminating migrator ${instance_id}"
  aws ec2 terminate-instances --instance-ids "${instance_id}" >/dev/null || true
}
trap terminate EXIT

aws ec2 wait instance-running --instance-ids "${instance_id}"

log "waiting for the SSM agent to come online"
for _ in $(seq 1 60); do
  ping="$(aws ssm describe-instance-information --filters "Key=InstanceIds,Values=${instance_id}" \
    --query 'InstanceInformationList[0].PingStatus' --output text)"
  [ "${ping}" = "Online" ] && break
  sleep 5
done
[ "${ping}" = "Online" ] || fail "migrator ${instance_id} never registered with SSM (5 min)"

# cloud-init writes /etc/beacon/instance.env, which migrate.sh needs; the SSM
# agent can be online before user-data finishes.
params="$(jq -cn --arg v "${version}" '{
  commands: ["cloud-init status --wait >/dev/null || true", ("/opt/beacon/migrate.sh " + $v)],
  executionTimeout: ["900"]
}')"
command_id="$(aws ssm send-command \
  --instance-ids "${instance_id}" \
  --document-name AWS-RunShellScript \
  --comment "migrate ${ENVIRONMENT} to ${version}" \
  --parameters "${params}" \
  --query Command.CommandId --output text)"
log "running migrations (command ${command_id})"

status=Pending
for _ in $(seq 1 200); do
  sleep 5
  status="$(aws ssm get-command-invocation --command-id "${command_id}" --instance-id "${instance_id}" \
    --query Status --output text 2>/dev/null || echo Pending)"
  case "${status}" in Pending | InProgress | Delayed) continue ;; *) break ;; esac
done

echo "::group::migrator output" >&2
aws ssm get-command-invocation --command-id "${command_id}" --instance-id "${instance_id}" \
  --query '[StandardOutputContent, StandardErrorContent]' --output text >&2 || true
echo "::endgroup::" >&2

[ "${status}" = "Success" ] || fail "migrations failed on ${instance_id} (SSM status: ${status}); see 'migrator output' above"
log "migrations applied for ${version}"
