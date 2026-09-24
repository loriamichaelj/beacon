#!/usr/bin/env bash
# Bring this instance to the release version SSM currently points at
# (docs/CLOUD-DEVOPS-DESIGN.md §6.4). Run once at first boot by the launch
# template's user-data. Deploys and rollbacks never update instances in place:
# an ASG instance refresh replaces them, and each new instance runs this.
#
# Migrations are NOT run here (§7.1.2); see migrate.sh.

# shellcheck source=lib.sh
. /opt/beacon/lib.sh

version="$(get_param "${PARAM_PREFIX}/release-version")"
if [ "${version}" = "none" ]; then
  # Fresh infrastructure: nothing deployed yet. The instance fails its ALB
  # health check and the ASG replaces it until the first deploy (§7.1.1).
  log "release-version is 'none'; nothing to deploy"
  exit 0
fi
log "deploying ${BEACON_ENV} release ${version}"

# --- Backend container ------------------------------------------------------
load_image "${version}"
write_app_env "${version}" /etc/beacon/app.env

docker rm -f beacon-api >/dev/null 2>&1 || true
mapfile -t extra < <(container_args)
docker run -d --name beacon-api --restart unless-stopped \
  -p 127.0.0.1:8000:8000 \
  --env-file /etc/beacon/app.env \
  "${extra[@]}" \
  --log-driver awslogs \
  --log-opt awslogs-region="${AWS_REGION}" \
  --log-opt awslogs-group="${LOG_GROUP_PREFIX}/api" \
  --log-opt awslogs-stream="$(hostname)" \
  "${IMAGE_REPO}:${version}" >/dev/null

# --- Frontend (static files served by Nginx) --------------------------------
work="$(mktemp -d)"
aws s3 cp --only-show-errors "s3://${RELEASES_BUCKET}/${version}/frontend.tar.gz" "${work}/frontend.tar.gz"
rm -rf /var/www/beacon.new
mkdir -p /var/www/beacon.new
tar -xzf "${work}/frontend.tar.gz" -C /var/www/beacon.new
rm -rf "${work}" /var/www/beacon.old
if [ -d /var/www/beacon ]; then mv /var/www/beacon /var/www/beacon.old; fi
mv /var/www/beacon.new /var/www/beacon
rm -rf /var/www/beacon.old
chmod -R a+rX /var/www/beacon

# --- Nginx logs to CloudWatch (log group created by infra/env) --------------
cat > /opt/aws/amazon-cloudwatch-agent/etc/beacon.json <<EOF
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {"file_path": "/var/log/nginx/access.log", "log_group_name": "${LOG_GROUP_PREFIX}/nginx", "log_stream_name": "{instance_id}/access"},
          {"file_path": "/var/log/nginx/error.log",  "log_group_name": "${LOG_GROUP_PREFIX}/nginx", "log_stream_name": "{instance_id}/error"}
        ]
      }
    }
  }
}
EOF
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/beacon.json >&2 \
  || log "WARNING: CloudWatch agent failed to start; nginx logs won't ship"

nginx -t
systemctl reload-or-restart nginx

# Report readiness in the boot log; the ALB health check is what gates traffic.
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:8000/readyz; then
    log "backend ready (release ${version})"
    exit 0
  fi
  sleep 2
done
log "WARNING: backend not ready after 60s; see ${LOG_GROUP_PREFIX}/api in CloudWatch Logs"
