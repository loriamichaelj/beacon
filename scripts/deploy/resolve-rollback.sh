#!/usr/bin/env bash
# Choose and vet a rollback target (docs/CLOUD-DEVOPS-DESIGN.md §7.2).
#
# Input (environment variables, at most one of the first two):
#   TARGET_SHA           Git commit to roll back to; mapped to its release version
#   TARGET_VERSION       release version to roll back to
#                        (neither: the release that ran before the current one)
#   ALLOW_UNPROVEN       "true" to allow, in dev only, a target that never ran there
#   ALLOW_SCHEMA_CHANGE  "true" to allow a target across a schema change that
#                        isn't the immediately previous release
#   REPORT_FILE          optional; a Markdown report of the checks and recent
#                        releases is written here for the job summary
#
# Rules (any failure stops the rollback):
#   1. published   the target is a complete release in the releases bucket
#   2. proven      the target has run in this environment before (release-version
#                  history); dev may override with ALLOW_UNPROVEN
#   3. schema      rollbacks never undo migrations, and only the previous
#                  release is guaranteed to work on the current schema
#                  (expand/contract, §7.1.2). So if backend/alembic/versions
#                  differs between the running release and the target, the
#                  target must be the previous release, or ALLOW_SCHEMA_CHANGE
#
# Needs AWS credentials for the environment and a full-history checkout (for
# SHA lookup and the schema comparison). Prints current_version, current_sha,
# target_version, target_sha, schema_changed on stdout.
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

TARGET_SHA="${TARGET_SHA:-}"
TARGET_VERSION="${TARGET_VERSION:-}"
REPORT_FILE="${REPORT_FILE:-/dev/null}"
report() { echo "$*" >> "${REPORT_FILE}"; }

[ -z "${TARGET_SHA}" ] || [ -z "${TARGET_VERSION}" ] \
  || fail "Give either a commit SHA or a release version, not both."

aws ssm get-parameter --name "${RELEASE_PARAM}" >/dev/null 2>&1 \
  || fail "No ${RELEASE_PARAM}. Does ${ENVIRONMENT} have infrastructure (terraform target=infra)?"
current="$(current_release)"
[ "${current}" != "none" ] || fail "Nothing is deployed to ${ENVIRONMENT}; there's nothing to roll back."

# The git commit a release was built from, recorded in its manifest.
release_sha() {
  aws s3 cp --only-show-errors "s3://${RELEASES_BUCKET}/$1/manifest.json" - 2>/dev/null \
    | jq -r '.git_sha // empty'
}

# Release history of this environment, oldest first, consecutive repeats collapsed.
history_file="$(mktemp)"
trap 'rm -f "${history_file}"' EXIT
aws ssm get-parameter-history --name "${RELEASE_PARAM}" \
  --query 'Parameters[].[Value, LastModifiedDate]' --output text \
  | awk -F'\t' '$1 != "none" && $1 != prev { print; prev = $1 }' > "${history_file}"

# The previous release: the newest history entry that isn't the current one.
previous="$(awk -F'\t' -v cur="${current}" '$1 != cur { p = $1 } END { print p }' "${history_file}")"

# --- Resolve the target -----------------------------------------------------
if [ -n "${TARGET_SHA}" ]; then
  git rev-parse --verify --quiet "${TARGET_SHA}^{commit}" >/dev/null \
    || fail "Commit ${TARGET_SHA} isn't in this repository (is it pushed to a branch?)."
  target_sha="$(git rev-parse "${TARGET_SHA}^{commit}")"
  target="$("$(dirname "$0")/../release/version.sh" "${target_sha}")"
  log "commit ${target_sha:0:12} is release ${target}"
elif [ -n "${TARGET_VERSION}" ]; then
  [[ "${TARGET_VERSION}" =~ ^[0-9a-f]{12}$ ]] || fail "'${TARGET_VERSION}' isn't a release version (12 hex characters)."
  target="${TARGET_VERSION}"
  target_sha=""
else
  [ -n "${previous}" ] || fail "${ENVIRONMENT} has no earlier release to roll back to."
  target="${previous}"
  target_sha=""
fi
[ "${target}" != "${current}" ] || fail "${ENVIRONMENT} already runs ${target}."

report "| Check | Result |"
report "|---|---|"

# --- Rule 1: published ------------------------------------------------------
release_complete "${target}" || fail "Release ${target} isn't published in the releases bucket."
report "| published | ✅ \`${target}\` is in the releases bucket |"

# --- Rule 2: proven in this environment -------------------------------------
if cut -f1 "${history_file}" | grep -qx "${target}"; then
  report "| proven | ✅ ran in ${ENVIRONMENT} before |"
elif [ "${ENVIRONMENT}" = "dev" ] && [ "${ALLOW_UNPROVEN:-false}" = "true" ]; then
  log "WARNING: ${target} never ran in dev; allowed by allow_unproven"
  report "| proven | ⚠️ never ran in dev; allowed by \`allow_unproven\` |"
else
  hint=""
  [ "${ENVIRONMENT}" = "dev" ] && hint=" Set allow_unproven to override (dev only)."
  fail "Release ${target} has never run in ${ENVIRONMENT}; only proven releases can be rollback targets.${hint}"
fi

# --- Rule 3: schema ---------------------------------------------------------
current_sha="$(release_sha "${current}")"
[ -n "${target_sha}" ] || target_sha="$(release_sha "${target}")"
[ -n "${current_sha}" ] && [ -n "${target_sha}" ] \
  || fail "Can't find the build commit of ${current} or ${target} (manifest.json git_sha)."
for s in "${current_sha}" "${target_sha}"; do
  git cat-file -e "${s}^{commit}" 2>/dev/null \
    || fail "Build commit ${s} isn't in this checkout; can't compare schemas."
done

migrations() { git rev-parse "$1:backend/alembic/versions"; }
if [ "$(migrations "${current_sha}")" = "$(migrations "${target_sha}")" ]; then
  schema_changed=false
  report "| schema | ✅ no migration changes between \`${current}\` and \`${target}\` |"
elif [ "${target}" = "${previous}" ]; then
  schema_changed=true
  log "schema differs, but ${target} is the previous release (backward-compatible by rule)"
  report "| schema | ⚠️ migrations differ; allowed: \`${target}\` is the previous release (expand/contract) |"
elif [ "${ALLOW_SCHEMA_CHANGE:-false}" = "true" ]; then
  schema_changed=true
  log "WARNING: rolling back across a schema change beyond the previous release; allowed by allow_schema_change"
  report "| schema | ⚠️ migrations differ and \`${target}\` isn't the previous release; allowed by \`allow_schema_change\` |"
else
  fail "Migrations differ between ${current} and ${target}, and ${target} isn't the previous release (${previous:-none}). Rolling back doesn't undo migrations, so ${target} may not work on the current schema. Set allow_schema_change to override."
fi

# --- Recent releases, for choosing a target ---------------------------------
report ""
report "**Recent ${ENVIRONMENT} releases** (newest first)"
report ""
report "| Release | Commit | Went live (UTC) | |"
report "|---|---|---|---|"
while IFS=$'\t' read -r v when; do
  s="$(release_sha "${v}")"
  mark=""
  [ "${v}" = "${current}" ] && mark="current"
  [ "${v}" = "${target}" ] && mark="**target**"
  report "| \`${v}\` | \`${s:0:7}\` | ${when%.*} | ${mark} |"
done < <(tail -n 10 "${history_file}" | awk '{ line[NR] = $0 } END { for (i = NR; i > 0; i--) print line[i] }')

log "${ENVIRONMENT}: roll back ${current} -> ${target} (schema changed: ${schema_changed})"
echo "current_version=${current}"
echo "current_sha=${current_sha}"
echo "target_version=${target}"
echo "target_sha=${target_sha}"
echo "schema_changed=${schema_changed}"
