# One app server running Docker Compose: Caddy, web, worker, ClamAV and PostgreSQL
# (ADR-009, ADR-010).
# No SSH: operators use SSM Session Manager; CI deploys through SSM Run Command.

data "aws_ssm_parameter" "amazon_linux" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/creator-platform/${var.environment}"
  retention_in_days = 30
}

resource "aws_instance" "server" {
  ami                    = data.aws_ssm_parameter.amazon_linux.value
  instance_type          = var.server_instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.server.id]
  iam_instance_profile   = aws_iam_instance_profile.server.name

  user_data = templatefile("${path.module}/templates/user-data.sh.tftpl", {
    compose_version = var.compose_version
    compose_sha256  = var.compose_sha256
    # NVMe disks show up under their volume id without the dash.
    data_volume_serial = replace(aws_ebs_volume.data.id, "-", "")
    deploy_script = templatefile("${path.module}/templates/deploy.sh.tftpl", {
      environment = var.environment
      region      = data.aws_region.current.region
      placeholder = local.placeholder
      domain      = var.domain
      log_group   = aws_cloudwatch_log_group.app.name
    })
    backup_script = templatefile("${path.module}/templates/backup.sh.tftpl", {
      region           = data.aws_region.current.region
      bucket           = aws_s3_bucket.backups.bucket
      metric_namespace = local.metric_namespace
    })
  })
  user_data_replace_on_change = true

  metadata_options {
    http_tokens = "required"
    # Containers reach the instance role's credentials through one extra network hop.
    http_put_response_hop_limit = 2
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 30
    encrypted   = true
  }

  tags = {
    Name = local.name
    # CI may only send deploy commands to instances with this tag (infra/bootstrap).
    Deploy = "creator-platform-${var.environment}"
  }

  lifecycle {
    # A newer Amazon Linux image must not replace the server by surprise; roll it deliberately.
    ignore_changes = [ami]
  }
}

resource "aws_eip" "server" {
  instance = aws_instance.server.id
  domain   = "vpc"
  tags     = { Name = local.name }
}
