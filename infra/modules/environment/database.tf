# The pilot's PostgreSQL runs on the app server (ADR-010) with its data on this separate,
# encrypted disk, so the server can be replaced without touching the data. Backups go to S3
# every hour (backup.sh); this disk is not the backup.

resource "aws_ebs_volume" "data" {
  availability_zone = local.zone
  size              = var.data_volume_gb
  type              = "gp3"
  encrypted         = true
  tags              = { Name = "${local.name}-data" }

  # An apply must never delete the database. (OpenTofu needs a literal here, so staging is
  # protected too; its teardown removes the volume by hand, docs/runbooks/deploy.md.)
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_volume_attachment" "data" {
  # Seen inside the server as an NVMe disk; user-data finds it by volume id.
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.server.id
}

# --- Backups (SR-15): hourly dumps kept 2 days, one a day kept 30 days ---

resource "aws_s3_bucket" "backups" {
  bucket = "${local.name}-backups-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_ownership_controls" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# AES-256 with S3-managed keys, like the uploads bucket (Q-39).
# trivy:ignore:AVD-AWS-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Versioning keeps an overwritten or deleted backup for 7 days (a mistaken or malicious
# delete is recoverable); after that, deleted personal data is really gone (PR-9).
resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "hourly"
    status = "Enabled"
    filter {
      prefix = "hourly/"
    }
    expiration {
      days = 2
    }
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }

  rule {
    id     = "daily"
    status = "Enabled"
    filter {
      prefix = "daily/"
    }
    expiration {
      days = 30
    }
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }

  rule {
    id     = "clean-up"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
    expiration {
      expired_object_delete_marker = true
    }
  }
}

data "aws_iam_policy_document" "backups_bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.backups.arn, "${aws_s3_bucket.backups.arn}/*"]
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

resource "aws_s3_bucket_policy" "backups" {
  bucket = aws_s3_bucket.backups.id
  policy = data.aws_iam_policy_document.backups_bucket.json
}
