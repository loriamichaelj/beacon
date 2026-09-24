#!/usr/bin/env bash
# Print the release version: a hash of the committed backend/ and frontend/
# Git trees (docs/CLOUD-DEVOPS-DESIGN.md §7.1). It survives dev -> stage -> prod
# merges unchanged, unlike a commit SHA.
#
#   version.sh             version of HEAD
#   version.sh <commit>    version of any commit (full or short SHA, branch, tag)
#
# For HEAD, fails if backend/ or frontend/ has uncommitted changes, since the
# version would then not describe what gets built. Set ALLOW_DIRTY=1 to
# override locally.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

commit="${1:-HEAD}"
if ! sha="$(git rev-parse --verify --quiet "${commit}^{commit}")"; then
  echo "error: '${commit}' isn't a commit in this repository" >&2
  exit 1
fi

if [ "${commit}" = "HEAD" ] && [ "${ALLOW_DIRTY:-0}" != "1" ] \
  && [ -n "$(git status --porcelain -- backend frontend)" ]; then
  echo "error: backend/ or frontend/ has uncommitted changes; commit first or set ALLOW_DIRTY=1" >&2
  exit 1
fi

printf '%s %s' "$(git rev-parse "${sha}:backend")" "$(git rev-parse "${sha}:frontend")" \
  | shasum -a 256 | cut -c1-12
