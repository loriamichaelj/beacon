# Set by terraform.yml: aws_region, name_prefix, iam_name_prefix (from
# infra/project.env), state_bucket, and environment. Everything else comes from
# environments/<environment>.tfvars.

variable "aws_region" {
  type = string
}

variable "name_prefix" {
  description = "Prefix for resource names, SSM paths, log groups, and the Project tag (e.g. loria-beacon)."
  type        = string
}

variable "iam_name_prefix" {
  description = "Prefix for IAM names; the shared account requires cloudbatch818-."
  type        = string
}

variable "state_bucket" {
  description = "Terraform state bucket, for reading the shared network's outputs."
  type        = string
}

variable "environment" {
  type = string

  validation {
    condition     = contains(["dev", "stage", "prod"], var.environment)
    error_message = "environment must be dev, stage, or prod."
  }
}

# --- Compute ------------------------------------------------------------------

variable "instance_type" {
  type = string
}

variable "asg_min_size" {
  type = number
}

variable "asg_max_size" {
  type = number
}

variable "asg_desired_capacity" {
  type = number
}

# --- Database -----------------------------------------------------------------

variable "db_instance_class" {
  type = string
}

variable "db_allocated_storage_gb" {
  type = number
}

variable "db_multi_az" {
  type = bool
}

variable "db_backup_retention_days" {
  type = number
}

variable "db_deletion_protection" {
  type = bool
}

variable "db_skip_final_snapshot" {
  description = "true only where the data is disposable (dev)."
  type        = bool
}

# --- Other --------------------------------------------------------------------

variable "alb_deletion_protection" {
  type = bool
}

variable "log_retention_days" {
  type = number
}
