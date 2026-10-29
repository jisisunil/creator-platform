# NFR-2 / NFR-10: uptime check from outside the server. Route 53 calls the app's health
# endpoint (which also checks the database) every 30 seconds from several AWS locations
# around the world, and an alarm emails the operations address when it fails for 2 minutes.
# About $1.50/month (HTTPS checks cost extra, but plain HTTP would only reach Caddy's
# redirect and report a dead app as healthy). Route 53 publishes its metrics only in
# us-east-1, so the alarm and its topic live there; they carry no personal data.

resource "aws_route53_health_check" "app" {
  type              = "HTTPS"
  fqdn              = var.domain
  port              = 443
  resource_path     = "/api/health"
  request_interval  = 30
  failure_threshold = 3
  enable_sni        = true
  tags              = { Name = "${local.name}-uptime" }
}

# Not encrypted: CloudWatch alarms cannot publish to a topic encrypted with the AWS-managed
# key, and messages carry the alarm name only, never personal data.
# trivy:ignore:AVD-AWS-0095
resource "aws_sns_topic" "uptime" {
  provider = aws.us_east_1
  name     = "${local.name}-uptime"
}

resource "aws_sns_topic_subscription" "uptime_email" {
  provider  = aws.us_east_1
  topic_arn = aws_sns_topic.uptime.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Before DNS points at the server (and while the certificate is being issued) this alarm is
# on; that is expected during setup.
resource "aws_cloudwatch_metric_alarm" "site_down" {
  provider            = aws.us_east_1
  alarm_name          = "${local.name}-site-down"
  alarm_description   = "https://${var.domain}/api/health has failed for 2 minutes; the site is down for users (docs/runbooks/deploy.md)."
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  dimensions          = { HealthCheckId = aws_route53_health_check.app.id }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.uptime.arn]
  ok_actions          = [aws_sns_topic.uptime.arn]
}
