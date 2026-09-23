# region, name_prefix, and iam_name_prefix come from infra/project.env via
# TF_VAR_* (set by the workflow), so they have no defaults here.

variable "region" {
  type = string
}

variable "name_prefix" {
  description = "Prefix for non-IAM resource names, SSM paths, and the Project tag (e.g. loria-beacon)."
  type        = string
}

variable "iam_name_prefix" {
  description = "Prefix for IAM roles and policies; the shared account requires cloudbatch818-."
  type        = string

  validation {
    condition     = startswith(var.iam_name_prefix, "cloudbatch818-")
    error_message = "IAM names in this account must start with \"cloudbatch818-\"."
  }
}

variable "github_repository" {
  description = "owner/name of the repository whose GitHub Environments may assume the deploy roles."
  type        = string
  default     = "loriamichaelj/beacon"
}

variable "state_bucket" {
  description = "Terraform state bucket name. Created by scripts/bootstrap/ensure-state-bucket.sh before init, then imported here."
  type        = string
}
