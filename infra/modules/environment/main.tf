data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name           = "creator-platform-${var.environment}"
  is_production  = var.environment == "production"
  parameter_path = "/creator-platform/${var.environment}/"
  # Secret parameters hold this until an operator sets them; deploy.sh refuses to run then.
  placeholder = "REPLACE_ME"
  # Custom metrics (backups, disk) and log-based metrics share this namespace.
  metric_namespace = "CreatorPlatform/${var.environment}"
  # The server and its data volume must share one availability zone.
  zone = data.aws_availability_zones.available.names[0]
}
