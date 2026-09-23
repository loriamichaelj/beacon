variable "region" {
  type    = string
  default = "us-east-1"
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
