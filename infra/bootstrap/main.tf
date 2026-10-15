# Applied once per AWS account, before the environments (docs/runbooks/deploy.md):
# the OpenTofu state bucket, the app image repository, and the roles GitHub Actions assumes
# through OIDC (no stored AWS keys, SR-10). Its own state is small and kept locally.

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "github_repository" {
  description = "owner/name of the GitHub repository whose workflows may build and deploy."
  type        = string
}

variable "region" {
  description = "PR-12: Mumbai."
  type        = string
  default     = "ap-south-1"
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "creator-platform", ManagedBy = "opentofu" }
  }
}

data "aws_caller_identity" "current" {}

locals {
  environments = ["staging", "production"]
}

# --- OpenTofu state for the environments ---

resource "aws_s3_bucket" "state" {
  bucket = "creator-platform-tofu-state-${data.aws_caller_identity.current.account_id}"
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# AES-256 with S3-managed keys. A customer-managed KMS key (~$1/month) would add key-level
# access control; optional hardening, not needed for the pilot (ADR-009, Q-39).
# trivy:ignore:AVD-AWS-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

data "aws_iam_policy_document" "state_bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state_bucket.json
}

# --- App image repository: one image, deployed to staging then production ---

resource "aws_ecr_repository" "app" {
  name                 = "creator-platform"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 30 newest images (enough to roll back weeks of deploys)"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
      action       = { type = "expire" }
    }]
  })
}

# --- GitHub Actions through OIDC ---

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "github_trust" {
  for_each = toset(concat(["build"], local.environments))
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Builds run from main only; deploys only from the matching GitHub environment, whose
    # protection rules (e.g. required reviewers for production) apply first.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [each.key == "build"
        ? "repo:${var.github_repository}:ref:refs/heads/main"
      : "repo:${var.github_repository}:environment:${each.key}"]
    }
  }
}

resource "aws_iam_role" "github_build" {
  name               = "creator-platform-github-build"
  assume_role_policy = data.aws_iam_policy_document.github_trust["build"].json
}

data "aws_iam_policy_document" "push_image" {
  statement {
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.app.arn]
  }
  statement {
    actions = ["ecr:GetAuthorizationToken"]
    # trivy:ignore:AVD-AWS-0057 GetAuthorizationToken has no resource-level permissions.
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_build" {
  name   = "push-app-image"
  role   = aws_iam_role.github_build.id
  policy = data.aws_iam_policy_document.push_image.json
}

resource "aws_iam_role" "github_deploy" {
  for_each           = toset(local.environments)
  name               = "creator-platform-github-deploy-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.github_trust[each.key].json
}

data "aws_iam_policy_document" "deploy" {
  for_each = toset(local.environments)
  # Run the deploy script, and only on this environment's server.
  statement {
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ec2:${var.region}:${data.aws_caller_identity.current.account_id}:instance/*"]
    condition {
      test     = "StringEquals"
      variable = "ssm:resourceTag/Deploy"
      values   = ["creator-platform-${each.key}"]
    }
  }
  statement {
    actions   = ["ssm:SendCommand"]
    resources = ["arn:aws:ssm:${var.region}::document/AWS-RunShellScript"]
  }
  statement {
    actions = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
    # trivy:ignore:AVD-AWS-0057 These read-only calls have no resource-level permissions.
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  for_each = toset(local.environments)
  name     = "deploy-${each.key}"
  role     = aws_iam_role.github_deploy[each.key].id
  policy   = data.aws_iam_policy_document.deploy[each.key].json
}

output "state_bucket" {
  description = "Pass to the environments: tofu init -backend-config=\"bucket=<this>\""
  value       = aws_s3_bucket.state.bucket
}

output "ecr_repository_url" {
  description = "GitHub variable ECR_REPOSITORY."
  value       = aws_ecr_repository.app.repository_url
}

output "ecr_repository_arn" {
  description = "Input ecr_repository_arn of each environment."
  value       = aws_ecr_repository.app.arn
}

output "github_build_role_arn" {
  description = "GitHub variable AWS_BUILD_ROLE_ARN."
  value       = aws_iam_role.github_build.arn
}

output "github_deploy_role_arns" {
  description = "GitHub environment variable AWS_DEPLOY_ROLE_ARN, per environment."
  value       = { for name, role in aws_iam_role.github_deploy : name => role.arn }
}
