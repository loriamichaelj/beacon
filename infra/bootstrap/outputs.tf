output "state_bucket" {
  value = aws_s3_bucket.tfstate.bucket
}

output "releases_bucket" {
  value = aws_s3_bucket.releases.bucket
}

output "instance_boundary_arn" {
  description = "Permissions boundary every infra/env instance role must carry."
  value       = aws_iam_policy.instance_boundary.arn
}

output "deploy_role_arns" {
  description = "Store each as the AWS_ROLE_ARN secret of the matching GitHub Environment."
  value = merge(
    { for env, role in aws_iam_role.env : env => role.arn },
    { shared = aws_iam_role.shared.arn },
  )
}
