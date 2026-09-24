#!/usr/bin/env bash
# Upload a packaged release to the releases bucket (design §7.1, steps 1-4):
#   s3://<prefix>-releases-<account>/<version>/{backend-image.tar,frontend.tar.gz,manifest.json}
#
#   publish-release.sh <version>            upload build/release/<version>/ (from `make package`)
#   publish-release.sh --check <version>    exit 0 if the release is already published
#
# Releases are immutable: a version that's already published is never
# overwritten. manifest.json goes last, marking the release complete.
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

if [ "${1:-}" = "--check" ]; then
  version="${2:?usage: publish-release.sh --check <version>}"
  if release_complete "${version}"; then
    log "release ${version} is already published"
    exit 0
  fi
  log "release ${version} is not published yet"
  exit 1
fi

version="${1:?usage: publish-release.sh <version>}"
src="build/release/${version}"
dest="s3://${RELEASES_BUCKET}/${version}"

if release_complete "${version}"; then
  log "release ${version} is already published; not overwriting"
  exit 0
fi
for f in backend-image.tar frontend.tar.gz; do
  [ -s "${src}/${f}" ] || fail "${src}/${f} is missing; run make package with VERSION=${version} first"
done

log "uploading ${version} to ${dest}/"
aws s3 cp --only-show-errors "${src}/backend-image.tar" "${dest}/backend-image.tar"
aws s3 cp --only-show-errors "${src}/frontend.tar.gz" "${dest}/frontend.tar.gz"

jq -n \
  --arg version "${version}" \
  --arg git_sha "${GIT_SHA:-unknown}" \
  --arg built_at "$(date -u +%FT%TZ)" \
  --arg run_url "${RUN_URL:-}" \
  '{version: $version, git_sha: $git_sha, built_at: $built_at, run_url: $run_url}' \
  > "${src}/manifest.json"
aws s3 cp --only-show-errors --content-type application/json "${src}/manifest.json" "${dest}/manifest.json"

log "published release ${version}"
