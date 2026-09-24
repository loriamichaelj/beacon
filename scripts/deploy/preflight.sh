#!/usr/bin/env bash
# Checks before any deploy step changes anything (design §7.1 step 5, §7.1.1).
# Fails with an actionable message instead of letting a deploy break halfway.
#
#   preflight.sh <version>
#
# Prints `previous_version=<value>` (the currently deployed release, or "none")
# on stdout.
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

version="${1:?usage: preflight.sh <version>}"

# 1. The environment's infrastructure exists.
asg_count="$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "${ASG_NAME}" \
  --query 'length(AutoScalingGroups)' --output text)"
[ "${asg_count}" = "1" ] \
  || fail "No ASG ${ASG_NAME}. Has terraform (target=infra, environment=${ENVIRONMENT}) been applied?"
aws ssm get-parameter --name "${RELEASE_PARAM}" >/dev/null 2>&1 \
  || fail "No ${RELEASE_PARAM}. Has terraform (target=infra, environment=${ENVIRONMENT}) been applied?"

# 2. The release was built (build once, promote forward: only dev builds).
if ! release_complete "${version}"; then
  if [ "${ENVIRONMENT}" = "dev" ]; then
    fail "Release ${version} isn't published; the build job should have published it."
  fi
  fail "Release ${version} was never built. Deploy this code to dev first; ${ENVIRONMENT} only promotes releases dev has built."
fi

# 3. prod only takes exactly what stage is running.
if [ "${ENVIRONMENT}" = "prod" ]; then
  stage_version="$(aws ssm get-parameter --name "/${NAME_PREFIX}/stage/release-version" \
    --query Parameter.Value --output text)"
  [ "${stage_version}" = "${version}" ] \
    || fail "prod can only deploy what stage runs: stage is on ${stage_version}, this is ${version}."
fi

# 4. No other rollout is in flight.
in_flight="$(aws autoscaling describe-instance-refreshes --auto-scaling-group-name "${ASG_NAME}" --max-records 5 \
  --query "length(InstanceRefreshes[?Status=='Pending' || Status=='InProgress' || Status=='Cancelling' || Status=='RollbackInProgress'])" \
  --output text)"
[ "${in_flight}" = "0" ] \
  || fail "An instance refresh is already in progress on ${ASG_NAME}; wait for it to finish."

previous="$(current_release)"
log "OK: ${ENVIRONMENT} runs ${previous}; deploying ${version}"
echo "previous_version=${previous}"
