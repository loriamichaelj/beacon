# Security groups: the isolation boundary between environments in the shared
# VPC (docs/CLOUD-DEVOPS-DESIGN.md §6.3). Tier-to-tier rules reference security
# group IDs, never CIDRs. No rule anywhere opens port 22.
#
#   internet --80--> alb --80--> app --5432--> db
#                                app --443---> VPC endpoints / S3
#
# Rules are separate aws_security_group_rule resources: the ALB and app groups
# reference each other, which inline rules can't express without a cycle.

resource "aws_security_group" "alb" {
  name        = "${local.base}-alb"
  description = "${local.env} ALB: HTTP from the internet"
  vpc_id      = local.vpc_id
  tags        = { Name = "${local.base}-alb" }
}

resource "aws_security_group" "app" {
  name        = "${local.base}-app"
  description = "${local.env} app instances: HTTP from the ALB only"
  vpc_id      = local.vpc_id
  tags        = { Name = "${local.base}-app" }
}

resource "aws_security_group" "db" {
  name        = "${local.base}-db"
  description = "${local.env} RDS: PostgreSQL from the app instances only"
  vpc_id      = local.vpc_id
  tags        = { Name = "${local.base}-db" }
}

# --- ALB ----------------------------------------------------------------------

resource "aws_security_group_rule" "alb_in_http" {
  security_group_id = aws_security_group.alb.id
  type              = "ingress"
  description       = "HTTP from the internet (redirects to 443 once DNS lands)"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group_rule" "alb_out_app" {
  security_group_id        = aws_security_group.alb.id
  type                     = "egress"
  description              = "HTTP to the app instances of this environment"
  from_port                = 80
  to_port                  = 80
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.app.id
}

# --- App instances ------------------------------------------------------------

resource "aws_security_group_rule" "app_in_alb" {
  security_group_id        = aws_security_group.app.id
  type                     = "ingress"
  description              = "HTTP from the ALB of this environment"
  from_port                = 80
  to_port                  = 80
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "app_out_db" {
  security_group_id        = aws_security_group.app.id
  type                     = "egress"
  description              = "PostgreSQL to the database of this environment"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.db.id
}

# Private subnets have no internet route, so HTTPS can only reach the VPC
# endpoints (SSM, CloudWatch Logs) and S3 through its gateway endpoint.
resource "aws_security_group_rule" "app_out_https" {
  security_group_id = aws_security_group.app.id
  type              = "egress"
  description       = "HTTPS to AWS APIs via VPC endpoints"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
}

# --- Database -----------------------------------------------------------------

resource "aws_security_group_rule" "db_in_app" {
  security_group_id        = aws_security_group.db.id
  type                     = "ingress"
  description              = "PostgreSQL from the app instances of this environment"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.app.id
}
