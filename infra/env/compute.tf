# EC2 tier (docs/CLOUD-DEVOPS-DESIGN.md §6.4): an Auto Scaling Group of
# instances launched from the shared base AMI. Each instance runs Nginx on the
# host and the backend as a container; /opt/beacon/deploy.sh (baked into the
# AMI) brings it to the release SSM points at when it first boots.

# --- Instance role --------------------------------------------------------------
# Capped by the boundary from infra/bootstrap: the deploy role may only create
# roles that carry it.

data "aws_iam_policy_document" "ec2_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "instance" {
  name                 = "${local.iam_n}-${local.env}-instance"
  assume_role_policy   = data.aws_iam_policy_document.ec2_trust.json
  permissions_boundary = "arn:${data.aws_partition.current.partition}:iam::${local.account_id}:policy/${local.iam_n}-instance-boundary"
}

# Session Manager and SSM Run Command (the migrator, §7.1.2).
resource "aws_iam_role_policy_attachment" "instance_ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "instance" {
  statement {
    sid       = "ReadOwnParameters"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = ["arn:${data.aws_partition.current.partition}:ssm:${var.aws_region}:${local.account_id}:parameter${local.param_prefix}/*"]
  }

  statement {
    sid       = "ReadReleases"
    actions   = ["s3:GetObject"]
    resources = ["arn:${data.aws_partition.current.partition}:s3:::${local.releases_bucket}/*"]
  }

  statement {
    sid     = "WriteOwnLogs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = flatten([
      for g in aws_cloudwatch_log_group.this : [g.arn, "${g.arn}:*"]
    ])
  }
}

resource "aws_iam_role_policy" "instance" {
  name   = "${local.base}-instance"
  role   = aws_iam_role.instance.id
  policy = data.aws_iam_policy_document.instance.json
}

resource "aws_iam_instance_profile" "instance" {
  name = "${local.iam_n}-${local.env}-instance"
  role = aws_iam_role.instance.name
}

# --- Launch template ------------------------------------------------------------

resource "aws_launch_template" "app" {
  name = "${local.base}-app"

  # Resolved at launch time, so a new base AMI reaches this environment at its
  # next instance refresh without a Terraform change (§6.4).
  image_id      = "resolve:ssm:/${local.n}/base-ami-id"
  instance_type = var.instance_type

  iam_instance_profile {
    arn = aws_iam_instance_profile.instance.arn
  }
  vpc_security_group_ids = [aws_security_group.app.id]

  # IMDSv2 only, hop limit 1: the host (Docker daemon, AWS CLI) can reach
  # instance metadata; containers can't.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  user_data = base64encode(<<-EOT
    #!/bin/bash
    set -euo pipefail
    install -d -m 755 /etc/beacon
    cat > /etc/beacon/instance.env <<'EOF'
    BEACON_ENV=${local.env}
    NAME_PREFIX=${local.n}
    RELEASES_BUCKET=${local.releases_bucket}
    AWS_REGION=${var.aws_region}
    EOF
    /opt/beacon/deploy.sh
  EOT
  )

  # Instances and volumes carry the same tags the deploy role is scoped by;
  # deploy.yml relies on them to find and target this environment's instances.
  dynamic "tag_specifications" {
    for_each = ["instance", "volume", "network-interface"]
    content {
      resource_type = tag_specifications.value
      tags = {
        Name        = "${local.base}-app"
        Project     = local.n
        Environment = local.env
        ManagedBy   = "terraform"
      }
    }
  }
}

# --- Auto Scaling Group -----------------------------------------------------------

resource "aws_autoscaling_group" "app" {
  name                = "${local.base}-asg"
  min_size            = var.asg_min_size
  max_size            = var.asg_max_size
  desired_capacity    = var.asg_desired_capacity
  vpc_zone_identifier = local.private_subnet_ids
  target_group_arns   = [aws_lb_target_group.app.arn]

  # ELB health checks: an instance whose /readyz fails is replaced. Before the
  # first deploy that includes every instance (§7.1.1), which is expected.
  health_check_type         = "ELB"
  health_check_grace_period = 300

  # Instances can't pass /readyz until something is deployed, so don't make
  # the apply wait for them.
  wait_for_capacity_timeout = "0"

  launch_template {
    id      = aws_launch_template.app.id
    version = aws_launch_template.app.latest_version
  }

  # Launch template changes made by Terraform roll out gradually, keeping
  # current capacity until replacements pass health checks. Deploys start
  # their own refreshes (deploy.yml) with the same preferences.
  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 100
      max_healthy_percentage = 200
      instance_warmup        = 120
    }
  }

  tag {
    key                 = "Name"
    value               = "${local.base}-app"
    propagate_at_launch = false # the launch template tags instances
  }
}
