# Beacon base AMI (docs/CLOUD-DEVOPS-DESIGN.md §6.4): Amazon Linux 2023 with
# Docker Engine, Nginx, and the CloudWatch Agent, plus the host scripts and
# config under ami/files/. No application code. One image for all
# environments; ami.yml publishes its ID to /<name_prefix>/base-ami-id.
#
# Built by ami.yml in the shared GitHub Environment. The build instance runs in
# one of the shared VPC's public subnets with a temporary public IP and a
# Packer-created security group that allows SSH from the runner's IP only.
# Every resource Packer creates is tagged Environment=shared + Project, which
# is what the shared deploy role is allowed to create and manage.

packer {
  required_plugins {
    amazon = {
      source  = "github.com/hashicorp/amazon"
      version = "~> 1.8"
    }
  }
}

variable "aws_region" {
  type = string
}

variable "name_prefix" {
  type = string
}

variable "ssh_private_key_file" {
  description = "Throwaway key generated per build by ami.yml; no AWS key pair is created."
  type        = string
}

variable "ssh_public_key" {
  description = "Public half of ssh_private_key_file, injected via user_data."
  type        = string
}

variable "git_sha" {
  type    = string
  default = "unknown"
}

variable "instance_type" {
  type    = string
  default = "t3.small"
}

locals {
  timestamp = formatdate("YYYYMMDD-hhmmss", timestamp())

  tags = {
    Project     = var.name_prefix
    Environment = "shared"
    ManagedBy   = "packer"
    Stack       = "ami"
  }
}

source "amazon-ebs" "base" {
  region          = var.aws_region
  ami_name        = "${var.name_prefix}-base-${local.timestamp}"
  ami_description = "Beacon base: AL2023 + Docker, Nginx, CloudWatch Agent (git ${var.git_sha})"
  instance_type   = var.instance_type

  source_ami_filter {
    filters = {
      name                = "al2023-ami-2023.*-kernel-*-x86_64"
      architecture        = "x86_64"
      virtualization-type = "hvm"
      root-device-type    = "ebs"
    }
    owners      = ["amazon"]
    most_recent = true
  }

  # Any public subnet of the shared VPC (they're all Environment=shared).
  subnet_filter {
    filters = {
      "tag:Project" = var.name_prefix
      "tag:Tier"    = "public"
    }
    most_free = true
  }
  associate_public_ip_address               = true
  temporary_security_group_source_public_ip = true

  communicator         = "ssh"
  ssh_interface        = "public_ip"
  ssh_username         = "ec2-user"
  ssh_private_key_file = var.ssh_private_key_file
  user_data            = <<-EOT
    #cloud-config
    ssh_authorized_keys:
      - ${var.ssh_public_key}
  EOT

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }
  # Instances launched from this AMI default to IMDSv2-only.
  imds_support = "v2.0"

  launch_block_device_mappings {
    device_name           = "/dev/xvda"
    volume_size           = 16
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }

  run_tags        = local.tags
  run_volume_tags = local.tags
  snapshot_tags   = local.tags
  tags = merge(local.tags, {
    Name       = "${var.name_prefix}-base-${local.timestamp}"
    GitSha     = var.git_sha
    SourceAMI  = "{{ .SourceAMI }}"
    SourceName = "{{ .SourceAMIName }}"
  })
}

build {
  sources = ["source.amazon-ebs.base"]

  provisioner "shell" {
    inline = ["mkdir -p /tmp/beacon-files"]
  }

  # Trailing slash: upload the directory's contents.
  provisioner "file" {
    source      = "${path.root}/files/"
    destination = "/tmp/beacon-files"
  }

  provisioner "shell" {
    execute_command = "sudo -E bash '{{ .Path }}'"
    script          = "${path.root}/scripts/provision.sh"
  }

  post-processor "manifest" {
    output     = "manifest.json"
    strip_path = true
  }
}
