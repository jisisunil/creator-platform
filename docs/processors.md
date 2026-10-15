# Data processors (PR-11)

Third parties that receive personal data or data derived from it. Every entry needs written
terms before launch and a mention in the privacy notice. Keep this list current.

| Processor                                     | Purpose                                                        | Data sent                                                           | Region                     | Status                                                     |
| --------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| Cloudflare Turnstile                          | CAPTCHA on sign-up and repeated sign-in failures (SR-3, SR-11) | Client IP, browser signals                                          | Global                     | Terms to sign before launch                                |
| Have I Been Pwned (Pwned Passwords)           | Breached-password check (SR-1)                                 | First 5 hex characters of the password's SHA-1 (k-anonymity)        | Global                     | Free API; no personal data stored by the service           |
| Google (OAuth)                                | "Continue with Google" sign-in                                 | Sign-in request; we receive name, email, Google account id          | Global                     | Google API terms; OAuth verification needed before launch  |
| Sentry (optional)                             | Error tracking                                                 | Error details with personal data collection off and events scrubbed | EU/US                      | Decide on SaaS vs self-hosted before launch (PR-12)        |
| Amazon Web Services: SES                      | Transactional email (FR-12)                                    | Recipient email, email content                                      | India (Mumbai, ap-south-1) | AWS Customer Agreement and DPA (accepted with the account) |
| Amazon Web Services: EC2, RDS, S3, CloudWatch | Hosting, database, uploaded files, logs (ADR-009)              | All platform data                                                   | India (Mumbai, ap-south-1) | AWS Customer Agreement and DPA (accepted with the account) |
