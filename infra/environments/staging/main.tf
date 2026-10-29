# Staging (ADR-009): same shape as production; destroy it between releases to save money. Apply: docs/runbooks/deploy.md.
#   tofu init -backend-config="bucket=<state bucket from infra/bootstrap>"
#   tofu apply -var-file=staging.tfvars

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  backend "s3" {
    key          = "staging/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = "ap-south-1" # PR-12: Mumbai
  default_tags {
    tags = { Project = "creator-platform", Environment = "staging", ManagedBy = "opentofu" }
  }
}

# Only for the uptime alarm: Route 53 publishes health-check metrics in us-east-1 alone.
# No personal data is stored there.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = { Project = "creator-platform", Environment = "staging", ManagedBy = "opentofu" }
  }
}

variable "domain" {
  description = "Public host name, e.g. staging.example.in."
  type        = string
}

variable "email_domain" {
  description = "Domain emails are sent from; must differ from production (one SES identity per domain), e.g. staging.example.in."
  type        = string
}

variable "alert_email" {
  description = "Operations address for alarms and budget alerts."
  type        = string
}

variable "ecr_repository_arn" {
  description = "Output ecr_repository_arn of infra/bootstrap."
  type        = string
}

variable "app_config" {
  description = "Non-secret settings: EMAIL_FROM, SALES_EMAIL, ALERT_EMAIL, AUTH_GOOGLE_ID, INSTAGRAM_APP_ID, NEXT_PUBLIC_TURNSTILE_SITE_KEY."
  type        = map(string)
}

module "environment" {
  source = "../../modules/environment"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  environment        = "staging"
  domain             = var.domain
  email_domain       = var.email_domain
  alert_email        = var.alert_email
  monthly_budget_usd = 40
  ecr_repository_arn = var.ecr_repository_arn
  vpc_cidr           = "10.30.0.0/16"
  app_config         = var.app_config
  app_secret_names   = toset(local.app_secret_names)
}

output "environment" {
  description = "Server IP, DNS records and the secrets still to set."
  value       = module.environment
}
