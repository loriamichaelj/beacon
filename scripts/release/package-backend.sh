#!/usr/bin/env bash
# Build the backend image for EC2 (linux/amd64) and save it as a tarball:
#   build/release/<version>/backend-image.tar
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

VERSION="${VERSION:-$(scripts/release/version.sh)}"
GIT_SHA="$(git rev-parse --short HEAD)"
OUT="build/release/${VERSION}"
IMAGE="beacon-backend:${VERSION}"

mkdir -p "${OUT}"
docker build \
  --platform linux/amd64 \
  --build-arg APP_VERSION="${VERSION}" \
  --build-arg GIT_SHA="${GIT_SHA}" \
  -t "${IMAGE}" \
  backend
docker save "${IMAGE}" -o "${OUT}/backend-image.tar"

echo "${OUT}/backend-image.tar"
