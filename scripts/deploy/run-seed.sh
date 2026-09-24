#!/usr/bin/env bash
# Load the local-dev seed data (backend/scripts/seed.py: 8 services, 20
# incidents) into dev's database. Dev only.
#
#   run-seed.sh
#
# Runs `python -m scripts.seed` from the release image dev is currently running,
# on one of its healthy instances via SSM Run Command, reusing that instance's
# container environment (/etc/beacon/app.env, written by deploy.sh). The seed
# is idempotent: it does nothing if any service already exists.
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

[ "${ENVIRONMENT}" = "dev" ] || fail "Seed data is for dev only (got ${ENVIRONMENT})."

version="$(current_release)"
[ "${version}" != "none" ] || fail "Nothing is deployed to dev yet; run the deploy workflow first."

# shellcheck disable=SC2016  # backticks are JMESPath literals, not shell
instance_id="$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "${ASG_NAME}" \
  --query 'AutoScalingGroups[0].Instances[?LifecycleState==`InService` && HealthStatus==`Healthy`].InstanceId | [0]' \
  --output text)"
[ -n "${instance_id}" ] && [ "${instance_id}" != "None" ] \
  || fail "No healthy InService instance in ${ASG_NAME}."
log "seeding dev (release ${version}) via ${instance_id}"

ca=/etc/beacon/rds-global-bundle.pem
params="$(jq -cn --arg v "${version}" --arg ca "${ca}" '{
  commands: [
    "set -e",
    ("docker run --rm --env-file /etc/beacon/app.env --read-only --tmpfs /tmp -v " + $ca + ":" + $ca + ":ro beacon-backend:" + $v + " python -m scripts.seed")
  ],
  executionTimeout: ["300"]
}')"
command_id="$(aws ssm send-command \
  --instance-ids "${instance_id}" \
  --document-name AWS-RunShellScript \
  --comment "seed dev (${version})" \
  --parameters "${params}" \
  --query Command.CommandId --output text)"

status=Pending
for _ in $(seq 1 60); do
  sleep 5
  status="$(aws ssm get-command-invocation --command-id "${command_id}" --instance-id "${instance_id}" \
    --query Status --output text 2>/dev/null || echo Pending)"
  case "${status}" in Pending | InProgress | Delayed) continue ;; *) break ;; esac
done

output="$(aws ssm get-command-invocation --command-id "${command_id}" --instance-id "${instance_id}" \
  --query '[StandardOutputContent, StandardErrorContent]' --output text 2>/dev/null || true)"
echo "::group::seed output" >&2
echo "${output}" >&2
echo "::endgroup::" >&2

[ "${status}" = "Success" ] || fail "seed failed on ${instance_id} (SSM status: ${status}); see 'seed output' above"
# The seed prints either "Seeded ..." or "... skipping seed."; pass it through.
echo "${output}" | grep -E 'Seeded|skipping' | head -1
