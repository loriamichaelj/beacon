#!/usr/bin/env bash
# Shared helpers for deploy.sh and migrate.sh (docs/CLOUD-DEVOPS-DESIGN.md §6.4,
# §7.1.2). Sourced, not executed.
#
# /etc/beacon/instance.env is written by the environment's launch template
# user-data (infra/env) and identifies which environment this instance serves:
#   BEACON_ENV       dev | stage | prod
#   NAME_PREFIX      e.g. loria-beacon (SSM paths, log groups)
#   RELEASES_BUCKET  e.g. loria-beacon-releases-<account-id>
#   AWS_REGION       e.g. us-east-1
#
# Instances have no internet route: every AWS call below goes through the
# VPC endpoints (SSM, S3, CloudWatch Logs).

set -euo pipefail

# shellcheck source=/dev/null
. /etc/beacon/instance.env
: "${BEACON_ENV:?}" "${NAME_PREFIX:?}" "${RELEASES_BUCKET:?}" "${AWS_REGION:?}"
export AWS_REGION AWS_DEFAULT_REGION="${AWS_REGION}"

PARAM_PREFIX="/${NAME_PREFIX}/${BEACON_ENV}"
# shellcheck disable=SC2034  # used by deploy.sh, which sources this file
LOG_GROUP_PREFIX="/${NAME_PREFIX}/${BEACON_ENV}"
CA_BUNDLE=/etc/beacon/rds-global-bundle.pem
IMAGE_REPO=beacon-backend

log() {
  local msg
  msg="beacon[$(basename "$0")]: $*"
  echo "$(date -u +%FT%TZ) ${msg}" >&2
  logger -t beacon -- "${msg}" || true
}

# get_param <name> [--with-decryption]
get_param() {
  aws ssm get-parameter --name "$1" ${2:+"$2"} --query Parameter.Value --output text
}

# load_image <version>: docker-load the release's backend image unless present.
load_image() {
  local version="$1" tarball
  if docker image inspect "${IMAGE_REPO}:${version}" >/dev/null 2>&1; then
    log "image ${IMAGE_REPO}:${version} already loaded"
    return
  fi
  tarball="$(mktemp -p /var/tmp backend-image.XXXXXX.tar)"
  log "downloading s3://${RELEASES_BUCKET}/${version}/backend-image.tar"
  aws s3 cp --only-show-errors "s3://${RELEASES_BUCKET}/${version}/backend-image.tar" "${tarball}"
  docker load -i "${tarball}" >&2
  rm -f "${tarball}"
}

# write_app_env <version> <file>: the container's environment, mode 0600.
# DATABASE_URL is a SecureString written by infra/env (§6.5); the password is
# alphanumeric, so it needs no quoting in docker's env-file format.
write_app_env() {
  local version="$1" file="$2" database_url
  database_url="$(get_param "${PARAM_PREFIX}/database-url" --with-decryption)"
  install -m 600 /dev/null "${file}"
  cat > "${file}" <<EOF
DATABASE_URL=${database_url}
DB_SSL=verify-full
DB_SSL_ROOT_CERT=${CA_BUNDLE}
APP_VERSION=${version}
LOG_LEVEL=INFO
EOF
}

# Arguments shared by every container run from the backend image.
container_args() {
  printf '%s\n' \
    --read-only --tmpfs /tmp \
    -v "${CA_BUNDLE}:${CA_BUNDLE}:ro"
}
