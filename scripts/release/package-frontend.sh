#!/usr/bin/env bash
# Build the SPA and tar its contents:
#   build/release/<version>/frontend.tar.gz
# Expects frontend dependencies to be installed (npm ci).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

VERSION="${VERSION:-$(scripts/release/version.sh)}"
OUT="build/release/${VERSION}"

mkdir -p "${OUT}"
(cd frontend && npm run build)
tar -C frontend/dist -czf "${OUT}/frontend.tar.gz" .

echo "${OUT}/frontend.tar.gz"
