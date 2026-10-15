# Secret settings the app reads (src/config/env.ts). OpenTofu creates each as a placeholder;
# the values are set with aws ssm put-parameter and never enter state (docs/runbooks/deploy.md).
# Set an optional one to "unset" to leave it empty (e.g. SENTRY_DSN without Sentry).
locals {
  app_secret_names = [
    "AUTH_SECRET",
    "TOKEN_ENCRYPTION_KEY",
    "SMTP_URL",
    "TURNSTILE_SECRET_KEY",
    "AUTH_GOOGLE_SECRET",
    "YOUTUBE_API_KEY",
    "INSTAGRAM_APP_SECRET",
    "SENTRY_DSN",
  ]
}
