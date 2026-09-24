#!/usr/bin/env bash
# Run `alembic upgrade head` from a release's backend image
# (docs/CLOUD-DEVOPS-DESIGN.md §7.1.2). Invoked by deploy.yml via SSM Run
# Command on a short-lived migrator instance, before the release-version
# pointer moves:
#
#   /opt/beacon/migrate.sh <version>
#
# Output goes to stdout/stderr so it appears in the SSM command output and in
# the Actions log. Exits non-zero if the migration fails.

# shellcheck source=lib.sh
. /opt/beacon/lib.sh

version="${1:?usage: migrate.sh <version>}"
env_file=/etc/beacon/migrate.env
trap 'rm -f "${env_file}"' EXIT

log "migrating ${BEACON_ENV} database to release ${version}"
load_image "${version}"
write_app_env "${version}" "${env_file}"

mapfile -t extra < <(container_args)
docker run --rm \
  --env-file "${env_file}" \
  "${extra[@]}" \
  "${IMAGE_REPO}:${version}" \
  alembic upgrade head

log "migration complete"
