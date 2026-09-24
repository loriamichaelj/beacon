# Deploy roles assumed by GitHub Actions via OIDC (docs/CLOUD-DEVOPS-DESIGN.md §5.2).
#
#   <iam_name_prefix>-deploy-{dev,stage,prod}  per-environment infra + releases
#   <iam_name_prefix>-deploy-shared            network, DNS, AMI (account-wide)
#
# Each role trusts exactly one GitHub Environment. Permissions are scoped by
# name pattern where the service supports resource ARNs, and by the
# Environment + Project tags where only IDs exist (EC2). The account is
# shared, so every tag condition checks Project too: another project's
# Environment=dev resources must stay out of reach. Read-only Describe/List
# calls are the only unscoped actions.
#
# Policy size: managed policies cap at 6,144 characters, so each role's
# permissions are split across several policies by concern.

locals {
  tfstate_arn  = "arn:${local.partition}:s3:::${var.state_bucket}"
  releases_arn = "arn:${local.partition}:s3:::${local.releases_bucket}"
  iam_prefix   = "arn:${local.partition}:iam::${local.account_id}"

  # n: resource names/paths; iam_n: IAM names (see infra/project.env).
  n     = var.name_prefix
  iam_n = var.iam_name_prefix

  arn_ec2  = "arn:${local.partition}:ec2:${var.aws_region}:${local.account_id}"
  arn_ssm  = "arn:${local.partition}:ssm:${var.aws_region}:${local.account_id}"
  arn_logs = "arn:${local.partition}:logs:${var.aws_region}:${local.account_id}"
  arn_elb  = "arn:${local.partition}:elasticloadbalancing:${var.aws_region}:${local.account_id}"
  arn_asg  = "arn:${local.partition}:autoscaling:${var.aws_region}:${local.account_id}"
  arn_rds  = "arn:${local.partition}:rds:${var.aws_region}:${local.account_id}"

  # Previous environment in the promotion chain, whose release-version the
  # preflight check reads (§7.1 step 5).
  upstream_environment = { dev = null, stage = "dev", prod = "stage" }
}

# --- Trust --------------------------------------------------------------------

data "aws_iam_policy_document" "github_trust" {
  for_each = setunion(local.app_environments, ["shared"])

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${var.github_oidc_sub_prefix}:environment:${each.key}"]
    }
  }
}

# --- Instance permissions boundary --------------------------------------------
# Every IAM role the env roles create (the EC2 instance role) must carry this
# boundary. Without it, a role that can create roles and write their policies
# could grant itself anything.

resource "aws_iam_policy" "instance_boundary" {
  name        = "${local.iam_n}-instance-boundary"
  description = "Upper bound on permissions for Beacon EC2 instance roles."
  policy      = data.aws_iam_policy_document.instance_boundary.json
}

data "aws_iam_policy_document" "instance_boundary" {
  statement {
    sid = "SessionManager"
    actions = [
      "ssm:UpdateInstanceInformation",
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
      "ec2messages:*",
      "ssm:ListInstanceAssociations",
      "ssm:DescribeInstanceProperties",
      "ssm:DescribeDocumentParameters",
      "ssm:GetDocument",
      "ssm:PutInventory",
      "ssm:PutComplianceItems",
      "ssm:PutConfigurePackageResult",
      "ssm:ListAssociations",
      "ssm:DescribeAssociation",
      "ssm:GetManifest",
      "ssm:UpdateAssociationStatus",
      "ssm:UpdateInstanceAssociationStatus",
      "ssm:GetDeployablePatchSnapshotForInstance",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "ReadBeaconParameters"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = ["${local.arn_ssm}:parameter/${local.n}/*"]
  }

  statement {
    sid       = "ReadReleases"
    actions   = ["s3:GetObject"]
    resources = ["${local.releases_arn}/*"]
  }

  statement {
    sid = "ShipLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = ["${local.arn_logs}:log-group:/${local.n}/*"]
  }

  statement {
    sid = "CloudWatchAgent"
    actions = [
      "cloudwatch:PutMetricData",
      "ec2:DescribeTags",
      "ec2:DescribeVolumes",
    ]
    resources = ["*"]
  }
}

# --- Per-environment deploy roles ---------------------------------------------

resource "aws_iam_role" "env" {
  for_each = local.app_environments

  name                 = "${local.iam_n}-deploy-${each.key}"
  description          = "GitHub Actions (Environment ${each.key}): infra/env Terraform, deploys, rollbacks."
  assume_role_policy   = data.aws_iam_policy_document.github_trust[each.key].json
  max_session_duration = 3600

  tags = { Environment = each.key }
}

resource "aws_iam_policy" "env_compute" {
  for_each = local.app_environments

  name   = "${local.iam_n}-deploy-${each.key}-compute"
  policy = data.aws_iam_policy_document.env_compute[each.key].json
  tags   = { Environment = each.key }
}

resource "aws_iam_policy" "env_services" {
  for_each = local.app_environments

  name   = "${local.iam_n}-deploy-${each.key}-services"
  policy = data.aws_iam_policy_document.env_services[each.key].json
  tags   = { Environment = each.key }
}

resource "aws_iam_policy" "env_pipeline" {
  for_each = local.app_environments

  name   = "${local.iam_n}-deploy-${each.key}-pipeline"
  policy = data.aws_iam_policy_document.env_pipeline[each.key].json
  tags   = { Environment = each.key }
}

resource "aws_iam_role_policy_attachment" "env" {
  for_each = {
    for pair in setproduct(local.app_environments, ["compute", "services", "pipeline"]) :
    "${pair[0]}-${pair[1]}" => { env = pair[0], kind = pair[1] }
  }

  role = aws_iam_role.env[each.value.env].name
  policy_arn = {
    compute  = aws_iam_policy.env_compute
    services = aws_iam_policy.env_services
    pipeline = aws_iam_policy.env_pipeline
  }[each.value.kind][each.value.env].arn
}

# EC2 (tag-scoped), the instance IAM role (boundary-enforced), and the
# service-linked roles and KMS grants the managed services need.
data "aws_iam_policy_document" "env_compute" {
  for_each = local.app_environments

  statement {
    sid = "ReadOnly"
    actions = [
      "ec2:Describe*",
      "ec2:GetLaunchTemplateData",
      "elasticloadbalancing:Describe*",
      "autoscaling:Describe*",
      "rds:Describe*",
      "rds:ListTagsForResource",
      "ssm:DescribeParameters",
      "ssm:DescribeInstanceInformation",
      "logs:DescribeLogGroups",
      "kms:DescribeKey",
      "kms:ListAliases",
    ]
    resources = ["*"]
  }

  statement {
    sid = "Ec2CreateTagged"
    actions = [
      "ec2:CreateSecurityGroup",
      "ec2:CreateLaunchTemplate",
      "ec2:RunInstances",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Environment"
      values   = [each.key]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Project"
      values   = [local.n]
    }
  }

  statement {
    sid       = "Ec2TagOnCreate"
    actions   = ["ec2:CreateTags"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:CreateAction"
      values   = ["CreateSecurityGroup", "CreateLaunchTemplate", "RunInstances"]
    }
  }

  # EC2 authorizes RunInstances and CreateSecurityGroup against every resource
  # involved, not just the ones being created, and request tags only count for
  # the latter. The resources an environment merely *uses* need their own
  # grants: the shared VPC and subnets (Environment=shared, this Project only),
  # this account's AMIs, and the network interface RunInstances creates.
  statement {
    sid       = "Ec2UseSharedNetwork"
    actions   = ["ec2:CreateSecurityGroup", "ec2:RunInstances"]
    resources = ["${local.arn_ec2}:vpc/*", "${local.arn_ec2}:subnet/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Environment"
      values   = ["shared"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = [local.n]
    }
  }

  statement {
    sid       = "Ec2LaunchFromOwnAmi"
    actions   = ["ec2:RunInstances"]
    resources = ["arn:${local.partition}:ec2:${var.aws_region}::image/*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:Owner"
      values   = [local.account_id]
    }
  }

  statement {
    sid       = "Ec2LaunchInterfaces"
    actions   = ["ec2:RunInstances"]
    resources = ["${local.arn_ec2}:network-interface/*"]
  }

  statement {
    sid = "Ec2ManageOwn"
    actions = [
      "ec2:AuthorizeSecurityGroupIngress",
      "ec2:AuthorizeSecurityGroupEgress",
      "ec2:RevokeSecurityGroupIngress",
      "ec2:RevokeSecurityGroupEgress",
      "ec2:ModifySecurityGroupRules",
      "ec2:UpdateSecurityGroupRuleDescriptionsIngress",
      "ec2:UpdateSecurityGroupRuleDescriptionsEgress",
      "ec2:DeleteSecurityGroup",
      "ec2:CreateLaunchTemplateVersion",
      "ec2:ModifyLaunchTemplate",
      "ec2:DeleteLaunchTemplate",
      "ec2:DeleteLaunchTemplateVersions",
      "ec2:TerminateInstances",
      "ec2:RunInstances", # using this environment's own security groups and launch template
      "ec2:CreateTags",
      "ec2:DeleteTags",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Environment"
      values   = [each.key]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = [local.n]
    }
  }

  statement {
    sid = "InstanceRoleWithBoundary"
    actions = [
      "iam:CreateRole",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
    ]
    resources = ["${local.iam_prefix}:role/${local.iam_n}-${each.key}-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [aws_iam_policy.instance_boundary.arn]
    }
  }

  statement {
    sid = "InstanceRoleManage"
    actions = [
      "iam:GetRole",
      "iam:DeleteRole",
      "iam:UpdateRole",
      "iam:UpdateRoleDescription",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:ListRoleTags",
      "iam:GetRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
    ]
    resources = ["${local.iam_prefix}:role/${local.iam_n}-${each.key}-*"]
  }

  statement {
    sid       = "InstanceProfile"
    actions   = ["iam:*InstanceProfile*", "iam:GetInstanceProfile"]
    resources = ["${local.iam_prefix}:instance-profile/${local.iam_n}-${each.key}-*"]
  }

  statement {
    sid       = "PassInstanceRoleToEc2"
    actions   = ["iam:PassRole"]
    resources = ["${local.iam_prefix}:role/${local.iam_n}-${each.key}-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ec2.amazonaws.com"]
    }
  }

  statement {
    sid       = "ServiceLinkedRoles"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "iam:AWSServiceName"
      values = [
        "autoscaling.amazonaws.com",
        "elasticloadbalancing.amazonaws.com",
        "rds.amazonaws.com",
      ]
    }
  }

  # Instances launched from the encrypted base AMI (migrator, ASG launch
  # validation) need the account's default EBS key via EC2.
  statement {
    sid = "EbsEncryptionViaEc2"
    actions = [
      "kms:CreateGrant",
      "kms:Decrypt",
      "kms:DescribeKey",
      "kms:GenerateDataKeyWithoutPlaintext",
      "kms:ReEncrypt*",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ec2.${var.aws_region}.amazonaws.com"]
    }
  }

  statement {
    sid       = "RdsEncryptionViaService"
    actions   = ["kms:CreateGrant", "kms:DescribeKey"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["rds.${var.aws_region}.amazonaws.com"]
    }
  }
}

# ALB, ASG, RDS, SSM parameters, and log groups: all name-scoped to <name_prefix>-<env>-*.
data "aws_iam_policy_document" "env_services" {
  for_each = local.app_environments

  statement {
    sid     = "LoadBalancer"
    actions = ["elasticloadbalancing:*"]
    resources = [
      "${local.arn_elb}:loadbalancer/app/${local.n}-${each.key}-*/*",
      "${local.arn_elb}:targetgroup/${local.n}-${each.key}-*/*",
      "${local.arn_elb}:listener/app/${local.n}-${each.key}-*/*",
      "${local.arn_elb}:listener-rule/app/${local.n}-${each.key}-*/*",
    ]
  }

  statement {
    sid       = "AutoScaling"
    actions   = ["autoscaling:*"]
    resources = ["${local.arn_asg}:autoScalingGroup:*:autoScalingGroupName/${local.n}-${each.key}-*"]
  }

  statement {
    sid     = "Database"
    actions = ["rds:*"]
    resources = [
      "${local.arn_rds}:db:${local.n}-${each.key}-*",
      "${local.arn_rds}:subgrp:${local.n}-${each.key}-*",
      "${local.arn_rds}:pg:${local.n}-${each.key}-*",
      "${local.arn_rds}:snapshot:${local.n}-${each.key}-*",
      # AWS-owned default option group every PostgreSQL instance uses; it
      # can't be modified, only referenced.
      "${local.arn_rds}:og:default:*",
    ]
  }

  statement {
    sid = "EnvParameters"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParameterHistory",
      "ssm:PutParameter",
      "ssm:DeleteParameter",
      "ssm:DeleteParameters",
      "ssm:AddTagsToResource",
      "ssm:RemoveTagsFromResource",
      "ssm:ListTagsForResource",
    ]
    resources = ["${local.arn_ssm}:parameter/${local.n}/${each.key}/*"]
  }

  statement {
    sid     = "ReadSharedParameters"
    actions = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = concat(
      ["${local.arn_ssm}:parameter/${local.n}/base-ami-id"],
      local.upstream_environment[each.key] == null ? [] : [
        "${local.arn_ssm}:parameter/${local.n}/${local.upstream_environment[each.key]}/release-version",
      ],
    )
  }

  statement {
    sid     = "LogGroups"
    actions = ["logs:*"]
    resources = [
      "${local.arn_logs}:log-group:/${local.n}/${each.key}/*",
      "${local.arn_logs}:log-group:/${local.n}/${each.key}/*:*",
    ]
  }
}

# Terraform state, release artifacts, and the migrator's SSM Run Command.
data "aws_iam_policy_document" "env_pipeline" {
  for_each = local.app_environments

  statement {
    sid       = "StateList"
    actions   = ["s3:ListBucket"]
    resources = [local.tfstate_arn]
  }

  statement {
    sid       = "StateOwn"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.tfstate_arn}/env:/${each.key}/*"]
  }

  statement {
    sid       = "StateReadShared"
    actions   = ["s3:GetObject"]
    resources = ["${local.tfstate_arn}/env:/shared/*"]
  }

  statement {
    sid       = "ReleasesRead"
    actions   = ["s3:ListBucket", "s3:GetObject"]
    resources = [local.releases_arn, "${local.releases_arn}/*"]
  }

  # Build once: only dev ever uploads artifacts (§7.1 steps 1-4).
  dynamic "statement" {
    for_each = each.key == "dev" ? [1] : []
    content {
      sid       = "ReleasesWrite"
      actions   = ["s3:PutObject"]
      resources = ["${local.releases_arn}/*"]
    }
  }

  statement {
    sid       = "MigratorRunCommandDocument"
    actions   = ["ssm:SendCommand"]
    resources = ["arn:${local.partition}:ssm:${var.aws_region}::document/AWS-RunShellScript"]
  }

  statement {
    sid       = "MigratorRunCommandTarget"
    actions   = ["ssm:SendCommand"]
    resources = ["${local.arn_ec2}:instance/*"]
    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Environment"
      values   = [each.key]
    }
    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Project"
      values   = [local.n]
    }
  }

  statement {
    sid = "MigratorRunCommandResults"
    actions = [
      "ssm:GetCommandInvocation",
      "ssm:ListCommandInvocations",
      "ssm:ListCommands",
    ]
    resources = ["*"]
  }
}

# --- Shared role: network (and later DNS and AMI builds) ----------------------
# DNS (§6.7) and Packer (§6.4) permissions are added in the steps that
# introduce those roots; bootstrap.yml re-applies this file.

resource "aws_iam_role" "shared" {
  name                 = "${local.iam_n}-deploy-shared"
  description          = "GitHub Actions (Environment shared): network, DNS, AMI."
  assume_role_policy   = data.aws_iam_policy_document.github_trust["shared"].json
  max_session_duration = 3600
}

resource "aws_iam_policy" "shared_network" {
  name   = "${local.iam_n}-deploy-shared-network"
  policy = data.aws_iam_policy_document.shared_network.json
}

resource "aws_iam_role_policy_attachment" "shared_network" {
  role       = aws_iam_role.shared.name
  policy_arn = aws_iam_policy.shared_network.arn
}

data "aws_iam_policy_document" "shared_network" {
  statement {
    sid       = "ReadOnly"
    actions   = ["ec2:Describe*", "ssm:DescribeParameters"]
    resources = ["*"]
  }

  statement {
    sid = "NetworkCreateTagged"
    actions = [
      "ec2:CreateVpc",
      "ec2:CreateSubnet",
      "ec2:CreateInternetGateway",
      "ec2:CreateRouteTable",
      "ec2:CreateSecurityGroup",
      "ec2:CreateVpcEndpoint",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Environment"
      values   = ["shared"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Project"
      values   = [local.n]
    }
  }

  statement {
    sid       = "NetworkTagOnCreate"
    actions   = ["ec2:CreateTags"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:CreateAction"
      values = [
        "CreateVpc",
        "CreateSubnet",
        "CreateInternetGateway",
        "CreateRouteTable",
        "CreateSecurityGroup",
        "CreateVpcEndpoint",
      ]
    }
  }

  # Everything the network root does to resources it already owns: routes,
  # associations, attachments, attribute changes, deletes. Bounded by the
  # Environment=shared + Project tags, which only this role can set.
  statement {
    sid       = "NetworkManageOwn"
    actions   = ["ec2:*"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Environment"
      values   = ["shared"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = [local.n]
    }
  }

  statement {
    sid       = "EndpointServiceLinkedRole"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "iam:AWSServiceName"
      values   = ["vpcendpoint.amazonaws.com"]
    }
  }

  # Interface endpoints with private DNS attach the VPC to an AWS-managed
  # private hosted zone; AWS checks these as dependent actions of
  # CreateVpcEndpoint / DeleteVpcEndpoints. Not tag-scoped (Route 53 hosted
  # zones don't support it); the role can't create or edit zones or records.
  statement {
    sid = "EndpointPrivateDns"
    actions = [
      "route53:AssociateVPCWithHostedZone",
      "route53:DisassociateVPCFromHostedZone",
    ]
    resources = [
      "arn:${local.partition}:route53:::hostedzone/*",
      "${local.arn_ec2}:vpc/*",
    ]
  }

  statement {
    sid = "SharedParameters"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:PutParameter",
      "ssm:DeleteParameter",
      "ssm:AddTagsToResource",
      "ssm:ListTagsForResource",
    ]
    resources = ["${local.arn_ssm}:parameter/${local.n}/base-ami-id"]
  }

  statement {
    sid       = "StateList"
    actions   = ["s3:ListBucket"]
    resources = [local.tfstate_arn]
  }

  statement {
    sid       = "StateShared"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.tfstate_arn}/env:/shared/*"]
  }
}

# --- Shared role: base AMI builds (ami/ via ami.yml) ---------------------------
# Packer launches a build instance in a shared public subnet, snapshots it into
# an AMI, and cleans up. Everything it creates carries Environment=shared +
# Project (run_tags / tags in ami/beacon-base.pkr.hcl), so creation is allowed
# by request tag and every later call (stop, modify, terminate, tag, delete the
# temporary security group, deregister old AMIs) by the NetworkManageOwn
# statement above. No key pair or instance profile is involved.

resource "aws_iam_policy" "shared_ami" {
  name   = "${local.iam_n}-deploy-shared-ami"
  policy = data.aws_iam_policy_document.shared_ami.json
}

resource "aws_iam_role_policy_attachment" "shared_ami" {
  role       = aws_iam_role.shared.name
  policy_arn = aws_iam_policy.shared_ami.arn
}

data "aws_iam_policy_document" "shared_ami" {
  statement {
    sid       = "BuildCreateTagged"
    actions   = ["ec2:RunInstances", "ec2:CreateImage"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Environment"
      values   = ["shared"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Project"
      values   = [local.n]
    }
  }

  # Resources RunInstances uses but doesn't create, which request tags don't
  # cover: the source AMI (Amazon's, or this account's) and the network
  # interface the launch creates. Subnets and Packer's security group are
  # tagged, so NetworkManageOwn covers them.
  statement {
    sid       = "BuildLaunchFromAmi"
    actions   = ["ec2:RunInstances"]
    resources = ["arn:${local.partition}:ec2:${var.aws_region}::image/*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:Owner"
      values   = ["amazon", local.account_id]
    }
  }

  statement {
    sid       = "BuildLaunchInterfaces"
    actions   = ["ec2:RunInstances"]
    resources = ["${local.arn_ec2}:network-interface/*"]
  }

  statement {
    sid       = "BuildTagOnCreate"
    actions   = ["ec2:CreateTags"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:CreateAction"
      values   = ["RunInstances", "CreateImage"]
    }
  }

  # The build volume and the AMI's snapshot are encrypted with the account's
  # default EBS key; EC2 uses it on the caller's behalf.
  statement {
    sid = "EbsEncryptionViaEc2"
    actions = [
      "kms:CreateGrant",
      "kms:Decrypt",
      "kms:DescribeKey",
      "kms:GenerateDataKeyWithoutPlaintext",
      "kms:ReEncrypt*",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ec2.${var.aws_region}.amazonaws.com"]
    }
  }
}
