# RDS for PostgreSQL 16 (docs/CLOUD-DEVOPS-DESIGN.md §6.5), private, reachable
# only from this environment's app security group, TLS required.

resource "aws_db_subnet_group" "this" {
  name       = "${local.base}-db"
  subnet_ids = local.private_subnet_ids
}

resource "aws_db_parameter_group" "this" {
  name   = "${local.base}-pg16"
  family = "postgres16"

  # Reject plaintext connections; the app connects with DB_SSL=verify-full.
  # apply_method matches what RDS reports back; the provider's default
  # ("immediate") would show as a change on every plan.
  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }
}

# Alphanumeric only: the URL goes into docker's env-file format unquoted
# (ami/files/beacon/lib.sh). 32 characters of [A-Za-z0-9] is ~190 bits.
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_instance" "this" {
  identifier     = "${local.base}-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  db_name  = "beacon"
  username = "beacon"
  password = random_password.db.result
  port     = 5432

  allocated_storage = var.db_allocated_storage_gb
  storage_type      = "gp3"
  storage_encrypted = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
  parameter_group_name   = aws_db_parameter_group.this.name
  publicly_accessible    = false
  multi_az               = var.db_multi_az
  ca_cert_identifier     = "rds-ca-rsa2048-g1" # in the RDS global bundle baked into the AMI

  backup_retention_period    = var.db_backup_retention_days
  copy_tags_to_snapshot      = true
  deletion_protection        = var.db_deletion_protection
  skip_final_snapshot        = var.db_skip_final_snapshot
  final_snapshot_identifier  = var.db_skip_final_snapshot ? null : "${local.base}-db-final"
  auto_minor_version_upgrade = true
  apply_immediately          = local.env == "dev"
}

# The full connection URL, read by the instances at boot (§6.5). The password
# also lives in Terraform state, which is encrypted and readable only by the
# deploy roles and admins.
resource "aws_ssm_parameter" "database_url" {
  name        = "${local.param_prefix}/database-url"
  description = "SQLAlchemy URL for the ${local.env} database."
  type        = "SecureString"
  value       = "postgresql+asyncpg://${aws_db_instance.this.username}:${random_password.db.result}@${aws_db_instance.this.address}:${aws_db_instance.this.port}/${aws_db_instance.this.db_name}"
}
