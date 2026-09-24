#!/usr/bin/env bash
# Shared by scripts/deploy/*.sh (docs/CLOUD-DEVOPS-DESIGN.md §7). Sourced.
#
# Requires, from the workflow: NAME_PREFIX and AWS_REGION (infra/project.env),
# ENVIRONMENT (dev | stage | prod), and AWS credentials for that environment's
# deploy role. Scripts write results to stdout and progress to stderr.

set -euo pipefail

: "${NAME_PREFIX:?NAME_PREFIX must be set}" "${AWS_REGION:?AWS_REGION must be set}" "${ENVIRONMENT:?ENVIRONMENT must be set}"
case "${ENVIRONMENT}" in
  dev | stage | prod) ;;
  *) echo "::error::ENVIRONMENT must be dev, stage, or prod (got '${ENVIRONMENT}')" >&2; exit 1 ;;
esac
export AWS_REGION AWS_DEFAULT_REGION="${AWS_REGION}"

# Names created by infra/env and infra/bootstrap; used by the scripts sourcing this.
BASE="${NAME_PREFIX}-${ENVIRONMENT}"
# shellcheck disable=SC2034
ASG_NAME="${BASE}-asg"
# shellcheck disable=SC2034
ALB_NAME="${BASE}-alb"
RELEASE_PARAM="/${NAME_PREFIX}/${ENVIRONMENT}/release-version"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
RELEASES_BUCKET="${NAME_PREFIX}-releases-${ACCOUNT_ID}"

log() { echo "[$(basename "$0")] $*" >&2; }
fail() { echo "::error::$*" >&2; exit 1; }

# release_complete <version>: a release counts as published only once its
# manifest.json exists, which publish-release.sh uploads last.
release_complete() {
  aws s3api head-object --bucket "${RELEASES_BUCKET}" --key "$1/manifest.json" >/dev/null 2>&1
}

current_release() {
  aws ssm get-parameter --name "${RELEASE_PARAM}" --query Parameter.Value --output text
}
