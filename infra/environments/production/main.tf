# Production (ADR-009). Apply: docs/runbooks/deploy.md.
#   tofu init -backend-config="bucket=<state bucket from infra/bootstrap>"
#   tofu apply -var-file=production.tfvars

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  backend "s3" {
    key          = "production/terraform.tfstate"
    region       = "ap-south-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = "ap-south-1" # PR-12: Mumbai
  default_tags {
    tags = { Project = "creator-platform", Environment = "production", ManagedBy = "opentofu" }
  }
}

variable "domain" {
  description = "Public host name, e.g. app.example.in."
  type        = string
}

variable "email_domain" {
  description = "Domain emails are sent from, e.g. example.in."
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

  environment        = "production"
  domain             = var.domain
  email_domain       = var.email_domain
  alert_email        = var.alert_email
  monthly_budget_usd = 70
  ecr_repository_arn = var.ecr_repository_arn
  vpc_cidr           = "10.20.0.0/16"
  app_config         = var.app_config
  app_secret_names   = toset(local.app_secret_names)
}

output "environment" {
  description = "Server IP, DNS records and the secrets still to set."
  value       = module.environment
}
