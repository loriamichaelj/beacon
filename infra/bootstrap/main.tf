# Account-wide foundations (docs/CLOUD-DEVOPS-DESIGN.md §5.2). Applied only by
# bootstrap.yml, using the manually created bootstrap role.

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

# Exists once per account (it may predate this project); read here, never
# managed, since other projects in the shared account may rely on it.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition

  app_environments = toset(["dev", "stage", "prod"])

  releases_bucket = "${var.name_prefix}-releases-${local.account_id}"
}

# --- Terraform state bucket -------------------------------------------------
# Created bare by ensure-state-bucket.sh (Terraform can't create the bucket
# its own state lives in), then adopted here so its settings are managed.

import {
  to = aws_s3_bucket.tfstate
  id = var.state_bucket
}

resource "aws_s3_bucket" "tfstate" {
  bucket = var.state_bucket

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "aws_s3_bucket_policy" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  policy = data.aws_iam_policy_document.deny_insecure_transport["tfstate"].json

  depends_on = [aws_s3_bucket_public_access_block.tfstate]
}

# --- Release artifacts bucket -----------------------------------------------
# s3://<name_prefix>-releases-<acct>/<version>/{backend-image.tar,frontend.tar.gz}

resource "aws_s3_bucket" "releases" {
  bucket = local.releases_bucket

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "releases" {
  bucket = aws_s3_bucket.releases.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "releases" {
  bucket = aws_s3_bucket.releases.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "releases" {
  bucket                  = aws_s3_bucket.releases.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "releases" {
  bucket = aws_s3_bucket.releases.id
  policy = data.aws_iam_policy_document.deny_insecure_transport["releases"].json

  depends_on = [aws_s3_bucket_public_access_block.releases]
}

data "aws_iam_policy_document" "deny_insecure_transport" {
  for_each = {
    tfstate  = var.state_bucket
    releases = local.releases_bucket
  }

  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      "arn:${local.partition}:s3:::${each.value}",
      "arn:${local.partition}:s3:::${each.value}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}
