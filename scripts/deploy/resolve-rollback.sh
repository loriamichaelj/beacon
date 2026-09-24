#!/usr/bin/env bash
# Work out what a rollback should roll back to (design §7.2).
#
#   resolve-rollback.sh [<version>]
#
# With no argument, the target is the release that ran before the current one,
# read from the release-version parameter's own history (no separate release
# log needed). With an argument, that version is used as-is. Either way the
# target must be a published release and differ from what's running.
#
# Prints `current_version=<...>` and `target_version=<...>` on stdout.
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

requested="${1:-}"

aws ssm get-parameter --name "${RELEASE_PARAM}" >/dev/null 2>&1 \
  || fail "No ${RELEASE_PARAM}. Does ${ENVIRONMENT} have infrastructure (terraform target=infra)?"
current="$(current_release)"
[ "${current}" != "none" ] || fail "Nothing is deployed to ${ENVIRONMENT}; there's nothing to roll back."

if [ -n "${requested}" ]; then
  target="${requested}"
else
  # History is oldest-first. Walk back from the newest entry to the first value
  # that isn't the current release (or the "none" placeholder).
  target=""
  while read -r value; do
    if [ "${value}" != "${current}" ] && [ "${value}" != "none" ]; then
      target="${value}"
      break
    fi
  done < <(aws ssm get-parameter-history --name "${RELEASE_PARAM}" \
    --query 'Parameters[].Value' --output text | tr '\t' '\n' | tac)
  [ -n "${target}" ] || fail "${RELEASE_PARAM} has no earlier release to roll back to."
fi

[ "${target}" != "${current}" ] || fail "${ENVIRONMENT} already runs ${target}."
release_complete "${target}" || fail "Release ${target} isn't published in the releases bucket."

log "${ENVIRONMENT}: roll back ${current} -> ${target}"
echo "current_version=${current}"
echo "target_version=${target}"
