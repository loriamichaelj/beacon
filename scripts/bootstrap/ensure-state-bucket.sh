#!/usr/bin/env bash
# Create the Terraform state bucket if it doesn't exist yet, and print its name.
# Runs in bootstrap.yml before `terraform init`: Terraform can't create the
# bucket its own state lives in. infra/bootstrap then imports the bucket and
# manages the rest of its configuration.
#
# Versioning and the public access block are set here too, so state is
# protected from its very first write. Safe to re-run.
set -euo pipefail

# Both come from infra/project.env, loaded by the workflow.
REGION="${AWS_REGION:?AWS_REGION must be set}"
NAME_PREFIX="${NAME_PREFIX:?NAME_PREFIX must be set}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="${NAME_PREFIX}-tfstate-${ACCOUNT_ID}"

if aws s3api head-bucket --bucket "${BUCKET}" 2>/dev/null; then
  echo "State bucket ${BUCKET} already exists." >&2
else
  echo "Creating state bucket ${BUCKET} in ${REGION}." >&2
  if [ "${REGION}" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}" >/dev/null
  else
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}" \
      --create-bucket-configuration "LocationConstraint=${REGION}" >/dev/null
  fi
  aws s3api wait bucket-exists --bucket "${BUCKET}"
fi

aws s3api put-public-access-block --bucket "${BUCKET}" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "${BUCKET}" \
  --versioning-configuration Status=Enabled

echo "${BUCKET}"
