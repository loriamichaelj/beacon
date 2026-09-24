output "alb_dns_name" {
  description = "Where the environment is reachable (HTTP) until DNS lands."
  value       = aws_lb.this.dns_name
}

output "asg_name" {
  value = aws_autoscaling_group.app.name
}

output "launch_template_id" {
  value = aws_launch_template.app.id
}

output "app_security_group_id" {
  value = aws_security_group.app.id
}

output "private_subnet_ids" {
  value = local.private_subnet_ids
}

output "db_address" {
  value = aws_db_instance.this.address
}
