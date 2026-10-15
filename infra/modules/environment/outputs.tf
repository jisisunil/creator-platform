output "server_ip" {
  description = "Point the app's DNS A record here; Caddy then gets the TLS certificate."
  value       = aws_eip.server.public_ip
}

output "server_instance_id" {
  description = "For Session Manager (aws ssm start-session --target <id>)."
  value       = aws_instance.server.id
}

output "deploy_target_tag" {
  description = "CI sends deploy commands to the instance with tag Deploy=<this value>."
  value       = aws_instance.server.tags["Deploy"]
}

output "database_endpoint" {
  description = "Private database address (reachable from the server only)."
  value       = aws_db_instance.main.address
}

output "files_bucket" {
  description = "S3 bucket holding uploads."
  value       = aws_s3_bucket.files.bucket
}

output "parameter_path" {
  description = "Parameter Store path of the app's configuration."
  value       = local.parameter_path
}

output "secret_parameters_to_set" {
  description = "Set each with: aws ssm put-parameter --overwrite --type SecureString --name <name> --value <value>"
  value       = sort([for parameter in aws_ssm_parameter.secret : parameter.name])
}

output "email_dkim_records" {
  description = "Add these CNAME records to the email domain's DNS so SES can sign mail (DKIM)."
  value = [
    for token in aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens :
    "${token}._domainkey.${var.email_domain} CNAME ${token}.dkim.amazonses.com"
  ]
}

output "alerts_topic_arn" {
  description = "SNS topic for alarms. Confirm the subscription email after the first apply."
  value       = aws_sns_topic.alerts.arn
}
