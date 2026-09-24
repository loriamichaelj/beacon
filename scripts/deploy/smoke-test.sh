#!/usr/bin/env bash
# Smoke-test an environment through its public ALB after a rollout
# (design §7.1 step 9).
#
#   smoke-test.sh
#
# Prints `url=http://<alb-dns>` on stdout. Exits non-zero on the first failing
# check. Covers the whole path: ALB -> Nginx -> backend container -> RDS, the
# SPA, and the /metrics block.
set -euo pipefail
# shellcheck source=common.sh
. "$(dirname "$0")/common.sh"

dns="$(aws elbv2 describe-load-balancers --names "${ALB_NAME}" \
  --query 'LoadBalancers[0].DNSName' --output text)"
base="http://${dns}"
body="$(mktemp)"
trap 'rm -f "${body}"' EXIT

# check <path> <expected status> [<text the body must contain>]
check() {
  local path="$1" want="$2" needle="${3:-}" got
  got="$(curl -sS -o "${body}" -w '%{http_code}' --max-time 10 "${base}${path}" || echo 000)"
  if [ "${got}" != "${want}" ]; then
    log "FAIL ${path}: HTTP ${got}, expected ${want}"
    return 1
  fi
  if [ -n "${needle}" ] && ! grep -q -- "${needle}" "${body}"; then
    log "FAIL ${path}: body doesn't contain '${needle}'"
    return 1
  fi
  log "ok   ${path} -> ${got}"
}

# Newly registered targets can take a few health-check intervals to receive
# traffic; allow up to 2 minutes for the first check.
for _ in $(seq 1 24); do
  check /readyz 200 '"ready"' && break
  sleep 5
done
check /readyz 200 '"ready"' || fail "/readyz never became ready at ${base}"

failures=0
check /healthz 200                         || failures=$((failures + 1))
check "/api/v1/services?limit=1" 200 items || failures=$((failures + 1))
check / 200 'id="root"'                    || failures=$((failures + 1))
check /services 200 'id="root"'            || failures=$((failures + 1)) # SPA fallback
check /metrics 404                         || failures=$((failures + 1)) # never public
[ "${failures}" = "0" ] || fail "${failures} smoke check(s) failed at ${base}"

log "smoke tests passed at ${base}"
echo "url=${base}"
