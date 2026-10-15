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
  zones       = slice(data.aws_availability_zones.available.names, 0, 2)
}
