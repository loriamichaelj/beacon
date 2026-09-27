# Beacon

Beacon is a three-tier web app for tracking **services** and the
**incidents** raised against them, built to run on AWS EC2. It has a
React UI with an Overview dashboard and a timeline on every incident, a
versioned REST API in FastAPI, and PostgreSQL for storage.

It's also a DevOps project. The infrastructure is written in Terraform, the
instances start from a Packer-built AMI, and every deploy, rollback, and
migration runs in GitHub Actions through OIDC, so there's no local AWS
access.

## Branches

| Branch | Holds |
|---|---|
| `main` | The GitHub Actions workflows only |
| `dev` | The app, infrastructure, scripts, and docs |
| `stage`, `prod` | Promoted from `dev` by PR |

## Stack

- **App:** Python 3.12, FastAPI, SQLAlchemy (async), React 18, TypeScript, PostgreSQL 16
- **AWS:** VPC with private subnets and VPC endpoints, ALB, Auto Scaling Group, RDS, S3, SSM
- **Delivery:** Terraform, Packer, Docker, GitHub Actions

## More

The full README, setup steps, and design docs are on the
[`dev`](https://github.com/loriamichaelj/beacon/tree/dev) branch:

- [Application design](https://github.com/loriamichaelj/beacon/blob/dev/docs/3T-APP-DESIGN.md)
- [Cloud and DevOps design](https://github.com/loriamichaelj/beacon/blob/dev/docs/CLOUD-DEVOPS-DESIGN.md)
- [Runbook](https://github.com/loriamichaelj/beacon/blob/dev/docs/RUNBOOK.md)
