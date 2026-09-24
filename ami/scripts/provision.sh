#!/usr/bin/env bash
# Provision the Beacon base AMI (docs/CLOUD-DEVOPS-DESIGN.md §6.4). Runs as
# root on the Packer build instance, which, unlike the instances launched from
# this image, has internet access. Everything a running instance needs must be
# installed here: they can only reach AWS APIs through VPC endpoints.
#
# Packer uploads ami/files/ to /tmp/beacon-files before this runs.
set -euxo pipefail

FILES=/tmp/beacon-files

# --- Packages -----------------------------------------------------------------
dnf -y upgrade
dnf -y install docker nginx amazon-cloudwatch-agent
systemctl enable docker nginx

# Docker: keep running containers alive across daemon restarts, and cap the
# local json-file logs used by one-off containers (the API container logs to
# CloudWatch via the awslogs driver instead).
install -d -m 755 /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "live-restore": true,
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF

# --- Beacon host files --------------------------------------------------------
install -d -m 755 /etc/beacon /opt/beacon /var/www/beacon
install -m 644 "${FILES}/nginx.conf" /etc/nginx/nginx.conf
install -m 755 "${FILES}/beacon/lib.sh" "${FILES}/beacon/deploy.sh" "${FILES}/beacon/migrate.sh" /opt/beacon/
nginx -t

# RDS CA bundle for DB_SSL=verify-full (§6.5).
curl -fsSL --retry 3 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
  -o /etc/beacon/rds-global-bundle.pem
grep -q 'BEGIN CERTIFICATE' /etc/beacon/rds-global-bundle.pem
chmod 644 /etc/beacon/rds-global-bundle.pem

# --- Access: SSM Session Manager only (§6.2) ---------------------------------
# The SSM agent ships enabled on AL2023. SSH is disabled in the image (it keeps
# running for this build session only); security groups have no port 22 rule
# either.
systemctl disable sshd.service

# --- Clean up -----------------------------------------------------------------
dnf clean all
rm -rf "${FILES}" /var/cache/dnf/*
# Reset cloud-init so instances launched from the image run their own
# user-data from scratch.
cloud-init clean --logs
# Last: remove the build-only SSH key Packer injected via user-data.
rm -f /home/ec2-user/.ssh/authorized_keys
