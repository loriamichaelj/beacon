# aws_region and name_prefix come from infra/project.env via TF_VAR_* (set by
# terraform.yml), so they have no defaults here.

variable "aws_region" {
  type = string
}

variable "name_prefix" {
  description = "Prefix for resource names and the Project tag (e.g. loria-beacon)."
  type        = string
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}
