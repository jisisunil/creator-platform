variable "environment" {
  description = "staging or production. Names every resource and the Parameter Store path."
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production."
  }
}

variable "domain" {
  description = "Public host name of the app, e.g. app.example.in. DNS must point at the server's IP."
  type        = string
}

variable "email_domain" {
  description = "Domain emails are sent from (SES identity); DKIM records are output for DNS."
  type        = string
}

variable "alert_email" {
  description = "Operations address for alarms and the monthly budget alert."
  type        = string
}

variable "monthly_budget_usd" {
  description = "NFR-13: alert when the month's cost is forecast to pass this."
  type        = number
}

variable "ecr_repository_arn" {
  description = "The app image repository (from infra/bootstrap); the server may only pull from it."
  type        = string
}

variable "vpc_cidr" {
  description = "Address range of this environment's network."
  type        = string
  default     = "10.20.0.0/16"
}

variable "server_instance_type" {
  description = "Runs web, worker, ClamAV and Caddy; ClamAV alone needs ~1.2 GB, so 4 GB minimum."
  type        = string
  default     = "t3a.medium"
}

variable "database_instance_class" {
  description = "RDS instance size. db.t4g.micro fits the pilot (ADR-009); see ADR-005 for sizing."
  type        = string
  default     = "db.t4g.micro"
}

variable "database_storage_gb" {
  description = "Initial database storage; grows automatically up to database_max_storage_gb."
  type        = number
  default     = 20
}

variable "database_max_storage_gb" {
  description = "Upper bound for storage autoscaling."
  type        = number
  default     = 100
}

variable "app_config" {
  description = "Non-secret app settings written to Parameter Store (variable name → value)."
  type        = map(string)
  default     = {}
}

variable "app_secret_names" {
  description = "Secret app settings. Created with a placeholder; set the real values with aws ssm put-parameter."
  type        = set(string)
}

variable "compose_version" {
  description = "Docker Compose plugin release installed on the server."
  type        = string
  default     = "v5.5.1"
}

variable "compose_sha256" {
  description = "SHA-256 of docker-compose-linux-x86_64 for compose_version (from the release's checksums.txt)."
  type        = string
  default     = "db1889184726840f75c4f9c001048430d4f25b3be3cb084d3ddd762bc0aed576"
}
