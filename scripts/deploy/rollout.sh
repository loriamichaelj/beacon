#!/usr/bin/env bash
# Point the environment at a release and replace its instances
# (design §7.1 steps 7-8; also used by rollbacks, §7.2).
#
#   rollout.sh <version> <previous_version>
#
# Instances are never updated in place: the ASG instance refresh launches new
# instances, whose first boot runs /opt/beacon/deploy.sh for the release in SSM.
# With instances already serving (previous != none), replacements must pass the
# ALB health check before old ones go (100-200% healthy). On a fresh environment
# nothing is serving yet, so everything is replaced at once.
#
# If the refresh doesn't succeed, the pointer goes back to <previous_version>,
# so any instance the ASG launches later still boots the known-good release.
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

version="${1:?usage: rollout.sh <version> <previous_version>}"
previous="${2:?usage: rollout.sh <version> <previous_version>}"

restore_pointer() {
  if [ "${previous}" != "${version}" ]; then
    log "restoring ${RELEASE_PARAM} to ${previous}"
    aws ssm put-parameter --name "${RELEASE_PARAM}" --type String --value "${previous}" --overwrite >/dev/null || true
  fi
}

log "pointing ${RELEASE_PARAM} at ${version} (was ${previous})"
aws ssm put-parameter --name "${RELEASE_PARAM}" --type String --value "${version}" --overwrite >/dev/null

if [ "${previous}" = "none" ]; then
  preferences='{"MinHealthyPercentage":0,"MaxHealthyPercentage":100,"InstanceWarmup":120,"SkipMatching":false}'
else
  preferences='{"MinHealthyPercentage":100,"MaxHealthyPercentage":200,"InstanceWarmup":120,"SkipMatching":false}'
fi

if ! refresh_id="$(aws autoscaling start-instance-refresh --auto-scaling-group-name "${ASG_NAME}" \
  --strategy Rolling --preferences "${preferences}" --query InstanceRefreshId --output text)"; then
  restore_pointer
  fail "couldn't start an instance refresh on ${ASG_NAME}"
fi
log "instance refresh ${refresh_id} started"

# Up to 40 minutes.
status=Pending
for _ in $(seq 1 160); do
  sleep 15
  read -r status percent < <(aws autoscaling describe-instance-refreshes --auto-scaling-group-name "${ASG_NAME}" \
    --instance-refresh-ids "${refresh_id}" \
    --query 'InstanceRefreshes[0].[Status, PercentageComplete]' --output text)
  log "refresh ${status} (${percent}%)"
  case "${status}" in
    Successful) break ;;
    Pending | InProgress | Cancelling | RollbackInProgress | Baking) continue ;;
    *) break ;;
  esac
done

if [ "${status}" != "Successful" ]; then
  reason="$(aws autoscaling describe-instance-refreshes --auto-scaling-group-name "${ASG_NAME}" \
    --instance-refresh-ids "${refresh_id}" --query 'InstanceRefreshes[0].StatusReason' --output text || true)"
  restore_pointer
  fail "instance refresh ${refresh_id} ended as ${status}: ${reason}"
fi
log "all ${ENVIRONMENT} instances now run ${version}"
