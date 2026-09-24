terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }

  # Partial config; terraform.yml supplies bucket, key, and region via
  # -backend-config. Key: env:/<environment>/infra.tfstate.
  backend "s3" {
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.aws_region

  # The environment's deploy role may only create and manage resources carrying
  # these tags (infra/bootstrap/iam.tf), so they must be on everything.
  default_tags {
    tags = {
      Project     = var.name_prefix
      Environment = var.environment
      ManagedBy   = "terraform"
      Stack       = "env"
    }
  }
}
