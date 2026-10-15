# FR-12: outgoing email through Amazon SES in Mumbai. DKIM records are output for DNS. New
# SES accounts start in the sandbox; production access is requested once (runbook).

resource "aws_sesv2_email_identity" "domain" {
  email_identity = var.email_domain
}
