# App configuration in Parameter Store, one parameter per environment variable under
# /creator-platform/<environment>/. deploy.sh turns them into the containers' env file (SR-10).

locals {
  # Settings every live environment needs; app_config adds or overrides values.
  base_config = {
    APP_ENV                 = var.environment
    APP_URL                 = "https://${var.domain}"
    LOG_LEVEL               = "info"
    TRUSTED_PROXY_HOPS      = "1" # Caddy
    FILE_STORAGE            = "s3"
    S3_BUCKET               = aws_s3_bucket.files.bucket
    AWS_REGION              = data.aws_region.current.region
    MALWARE_SCANNER         = "clamav"
    CLAMAV_HOST             = "clamav"
    SOCIAL_PROVIDER_MODE    = "live"
    BREACHED_PASSWORD_CHECK = "hibp"
    # PostgreSQL allows 60 connections (compose.yaml): web 10 + worker 10 + pg-boss + admin.
    DATABASE_POOL_MAX = "10"
  }
}

resource "aws_ssm_parameter" "config" {
  for_each = merge(local.base_config, var.app_config)
  name     = "${local.parameter_path}${each.key}"
  type     = "String"
  value    = each.value
}

# Values are set by an operator (see docs/runbooks/deploy.md), so they never pass through
# OpenTofu state. Until then they hold the placeholder and deploy.sh refuses to run.
resource "aws_ssm_parameter" "secret" {
  for_each = var.app_secret_names
  name     = "${local.parameter_path}${each.key}"
  type     = "SecureString"
  value    = local.placeholder

  lifecycle {
    ignore_changes = [value]
  }
}
