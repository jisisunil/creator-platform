terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
      # Route 53 health-check metrics exist only in us-east-1 (uptime.tf).
      configuration_aliases = [aws.us_east_1]
    }
  }
}
