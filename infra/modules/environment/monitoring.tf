# SR-14 / NFR-10 / NFR-13: alarms for the app's own alerts and errors, the database, the
# server and the monthly bill, all emailed to the operations address through one SNS topic.

# Not encrypted: CloudWatch alarms cannot publish to a topic encrypted with the AWS-managed
# key, and messages carry alarm names and metrics, never personal data.
# trivy:ignore:AVD-AWS-0095
resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

locals {
  alarm_actions = [aws_sns_topic.alerts.arn]
  log_metrics = {
    # services/monitoring raises these (failed-login spikes, overdue data requests, API quota…).
    AppAlerts = "{ $.event = \"alert\" }"
    AppErrors = "{ ($.level = \"error\") || ($.level = \"fatal\") }"
  }
}

resource "aws_cloudwatch_log_metric_filter" "app" {
  for_each       = local.log_metrics
  name           = "${local.name}-${each.key}"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = each.value
  metric_transformation {
    name          = each.key
    namespace     = "CreatorPlatform/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "app_alert" {
  alarm_name          = "${local.name}-app-alert"
  alarm_description   = "The app raised a monitoring alert; details are in the alert email and the logs."
  namespace           = "CreatorPlatform/${var.environment}"
  metric_name         = "AppAlerts"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  depends_on          = [aws_cloudwatch_log_metric_filter.app]
}

resource "aws_cloudwatch_metric_alarm" "app_errors" {
  alarm_name          = "${local.name}-app-errors"
  alarm_description   = "10 or more errors logged in 5 minutes; check the logs and Sentry."
  namespace           = "CreatorPlatform/${var.environment}"
  metric_name         = "AppErrors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_actions
  depends_on          = [aws_cloudwatch_log_metric_filter.app]
}

# The hardware under the server failed: AWS moves it to healthy hardware (same IP and disk).
resource "aws_cloudwatch_metric_alarm" "server_recover" {
  alarm_name          = "${local.name}-server-recover"
  alarm_description   = "System status check failed; the instance is being recovered."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  dimensions          = { InstanceId = aws_instance.server.id }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_actions       = concat(local.alarm_actions, ["arn:aws:automate:${data.aws_region.current.region}:ec2:recover"])
}

resource "aws_cloudwatch_metric_alarm" "server_unhealthy" {
  alarm_name          = "${local.name}-server-unhealthy"
  alarm_description   = "The server's operating system stopped responding for 5 minutes; it is rebooted."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_Instance"
  dimensions          = { InstanceId = aws_instance.server.id }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 5
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_actions       = concat(local.alarm_actions, ["arn:aws:automate:${data.aws_region.current.region}:ec2:reboot"])
}

# t3a instances slow down when their CPU credits run out; that shows up here first.
resource "aws_cloudwatch_metric_alarm" "server_cpu_credits" {
  alarm_name          = "${local.name}-server-cpu-credits"
  alarm_description   = "CPU credits nearly used up; the server will be throttled. Consider a bigger size."
  namespace           = "AWS/EC2"
  metric_name         = "CPUCreditBalance"
  dimensions          = { InstanceId = aws_instance.server.id }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 3
  threshold           = 20
  comparison_operator = "LessThanThreshold"
  alarm_actions       = local.alarm_actions
}

locals {
  database_alarms = {
    cpu = {
      metric      = "CPUUtilization"
      threshold   = 80
      comparison  = "GreaterThanThreshold"
      description = "Database CPU above 80% for 15 minutes (NFR-1 at risk)."
    }
    storage = {
      metric      = "FreeStorageSpace"
      threshold   = 2 * 1024 * 1024 * 1024
      comparison  = "LessThanThreshold"
      description = "Less than 2 GB of database storage left (autoscaling may have hit its limit)."
    }
    memory = {
      metric      = "FreeableMemory"
      threshold   = 64 * 1024 * 1024
      comparison  = "LessThanThreshold"
      description = "Database memory nearly exhausted; consider the next instance size (ADR-005)."
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "database" {
  for_each            = local.database_alarms
  alarm_name          = "${local.name}-database-${each.key}"
  alarm_description   = each.value.description
  namespace           = "AWS/RDS"
  metric_name         = each.value.metric
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = each.value.threshold
  comparison_operator = each.value.comparison
  alarm_actions       = local.alarm_actions
}

# NFR-13: cost monitoring. Emails at 80% of actual spend and when the forecast passes 100%.
resource "aws_budgets_budget" "monthly" {
  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Counts this environment only. The Environment tag must be activated as a cost
  # allocation tag once in the Billing console (docs/runbooks/deploy.md).
  cost_filter {
    name   = "TagKeyValue"
    values = [join("$", ["user:Environment", var.environment])]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}
