# One application environment (dev, stage, or prod) in the shared VPC
# (docs/CLOUD-DEVOPS-DESIGN.md §6): ALB -> ASG of EC2 instances (Nginx + backend
# container) -> RDS for PostgreSQL. Applied by terraform.yml with
# target=infra, as the environment's own deploy role.

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

data "terraform_remote_state" "network" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "env:/shared/network.tfstate"
    region = var.aws_region
  }
}

locals {
  n     = var.name_prefix
  iam_n = var.iam_name_prefix
  env   = var.environment

  # "<prefix>-<env>", e.g. loria-beacon-dev. Every name below starts with it;
  # that's what the deploy role's IAM policy is scoped to.
  base = "${local.n}-${local.env}"

  account_id      = data.aws_caller_identity.current.account_id
  releases_bucket = "${local.n}-releases-${local.account_id}"
  param_prefix    = "/${local.n}/${local.env}"
  log_prefix      = "/${local.n}/${local.env}"

  network            = data.terraform_remote_state.network.outputs
  vpc_id             = local.network.vpc_id
  public_subnet_ids  = local.network.public_subnet_ids[local.env]
  private_subnet_ids = local.network.private_subnet_ids[local.env]
}

# --- Log groups ---------------------------------------------------------------
# Created here, not by the instances: the instance role can only write to
# existing groups (infra/bootstrap boundary).

resource "aws_cloudwatch_log_group" "this" {
  for_each = toset(["api", "nginx"])

  name              = "${local.log_prefix}/${each.key}"
  retention_in_days = var.log_retention_days
}

# --- Release pointer (§7.1) ---------------------------------------------------
# deploy.yml / rollback.yml own the value from here on; Terraform only creates
# it. "none" means nothing has been deployed yet (§7.1.1).

resource "aws_ssm_parameter" "release_version" {
  name        = "${local.param_prefix}/release-version"
  description = "Release (content-hash version) that ${local.env} instances run."
  type        = "String"
  value       = "none"

  lifecycle {
    ignore_changes = [value, insecure_value]
  }
}
