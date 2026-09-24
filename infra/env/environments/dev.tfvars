# dev: cost-minimized, single instance, disposable data
# (docs/CLOUD-DEVOPS-DESIGN.md §6.4, §6.5).

instance_type        = "t3.micro"
asg_min_size         = 1
asg_max_size         = 2
asg_desired_capacity = 1

db_instance_class        = "db.t4g.micro"
db_allocated_storage_gb  = 20
db_multi_az              = false
db_backup_retention_days = 1
db_deletion_protection   = false
db_skip_final_snapshot   = true

alb_deletion_protection = false
log_retention_days      = 14
