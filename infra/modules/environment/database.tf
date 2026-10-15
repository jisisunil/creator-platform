# SR-15 / NFR-11: managed PostgreSQL with 30 days of point-in-time recovery. PR-12: Mumbai.
# SR-17: private subnets only. The master password is created by RDS in Secrets Manager and
# never enters OpenTofu state.

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_parameter_group" "main" {
  name   = local.name
  family = "postgres16"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  # Queries slower than 1 s are logged, so NFR-1 regressions show up in CloudWatch.
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
}

resource "aws_db_instance" "main" {
  identifier     = local.name
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.database_instance_class

  allocated_storage     = var.database_storage_gb
  max_allocated_storage = var.database_max_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name                     = "creator_platform"
  username                    = "creator_admin"
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]
  publicly_accessible    = false
  parameter_group_name   = aws_db_parameter_group.main.name

  backup_retention_period = 30
  # 03:00-03:30 India time, outside working hours; the daily social refresh starts at 02:00.
  backup_window              = "21:30-22:00"
  maintenance_window         = "sun:22:30-sun:23:30"
  copy_tags_to_snapshot      = true
  auto_minor_version_upgrade = true

  deletion_protection       = local.is_production
  skip_final_snapshot       = !local.is_production
  final_snapshot_identifier = "${local.name}-final"

  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  enabled_cloudwatch_logs_exports       = ["postgresql"]
}

# RDS rotates managed passwords weekly by default. The app reads its connection string at
# deploy time, so a rotation would break new connections until the next deploy. Rotation is
# therefore manual: rotate in Secrets Manager, then redeploy (docs/runbooks/deploy.md).
resource "aws_secretsmanager_secret_rotation" "database" {
  secret_id        = aws_db_instance.main.master_user_secret[0].secret_arn
  rotation_enabled = false
}
