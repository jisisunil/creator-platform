# SR-17: the server's role can do exactly what the app and deploy.sh need, nothing more.

data "aws_iam_policy_document" "server_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "server" {
  name               = "${local.name}-server"
  assume_role_policy = data.aws_iam_policy_document.server_assume.json
}

resource "aws_iam_instance_profile" "server" {
  name = "${local.name}-server"
  role = aws_iam_role.server.name
}

# Session Manager and Run Command (no SSH).
resource "aws_iam_role_policy_attachment" "server_ssm" {
  role       = aws_iam_role.server.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "server" {
  statement {
    sid     = "UploadedFiles"
    actions = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    # trivy:ignore:AVD-AWS-0057 Objects in this one bucket, under random keys chosen by the app.
    resources = ["${aws_s3_bucket.files.arn}/*"]
  }

  statement {
    sid       = "AppConfiguration"
    actions   = ["ssm:GetParametersByPath"]
    resources = ["arn:aws:ssm:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:parameter${trimsuffix(local.parameter_path, "/")}"]
  }

  # backup.sh writes dumps; restores and the drill read them back. No delete: expiry is
  # the bucket's lifecycle rules, so a compromised server can't erase the backups.
  statement {
    sid     = "DatabaseBackups"
    actions = ["s3:PutObject", "s3:GetObject"]
    # trivy:ignore:AVD-AWS-0057 Objects in the backup bucket only.
    resources = ["${aws_s3_bucket.backups.arn}/*"]
  }

  statement {
    sid       = "ListDatabaseBackups"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.backups.arn]
  }

  statement {
    sid     = "BackupMetrics"
    actions = ["cloudwatch:PutMetricData"]
    # trivy:ignore:AVD-AWS-0057 PutMetricData has no resource-level permissions; the
    # condition limits it to this environment's namespace.
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = [local.metric_namespace]
    }
  }

  statement {
    sid       = "PullAppImage"
    actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]
    resources = [var.ecr_repository_arn]
  }

  statement {
    sid     = "EcrLogin"
    actions = ["ecr:GetAuthorizationToken"]
    # trivy:ignore:AVD-AWS-0057 GetAuthorizationToken has no resource-level permissions.
    resources = ["*"]
  }

  statement {
    sid     = "ContainerLogs"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    # trivy:ignore:AVD-AWS-0057 Streams inside this environment's log group only.
    resources = ["${aws_cloudwatch_log_group.app.arn}:*"]
  }
}

resource "aws_iam_role_policy" "server" {
  name   = "${local.name}-server"
  role   = aws_iam_role.server.id
  policy = data.aws_iam_policy_document.server.json
}
