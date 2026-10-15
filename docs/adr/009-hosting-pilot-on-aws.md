# ADR-009: Pilot hosting on AWS Mumbai with OpenTofu

**Status:** accepted · 2026-10-15

## Context

Phase i needs production hosting. The product owner asked for the cheapest option for the
pilot, with OpenTofu for infrastructure as code (X-06). Constraints: data in Mumbai or
Hyderabad (PR-12), managed backups with point-in-time recovery (SR-15, NFR-11), database in
a private network and least-privilege roles (SR-17), secrets outside code and images (SR-10),
ClamAV for uploads in live environments (SR-9, needs ~1.2 GB RAM), and a worker that runs
all the time (pg-boss).

Options compared at pilot size (on-demand list prices, approximate):

| Option                                                        | Monthly | Notes                                                                                       |
| ------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| **AWS Mumbai: one EC2 VM (web, worker, ClamAV, Caddy) + RDS** | ~$50    | No load balancer, no NAT gateway; managed database with PITR; S3, SES, SSM in one account   |
| AWS Mumbai: ECS Fargate + ALB + NAT + RDS                     | ~$120   | Scales out without changes; the ALB and NAT alone cost more than the whole VM option        |
| Google Cloud Mumbai: Cloud Run + Cloud SQL + VM for ClamAV    | ~$55    | Web scales to zero, but the worker and ClamAV need an always-on VM anyway; no email service |
| Database on the VM too                                        | ~$30    | Loses managed backups and PITR; rejected ("database should support production traffic")     |

## Decision

AWS `ap-south-1` (Mumbai), one stack per environment (staging, production), defined with
OpenTofu in `infra/`:

- **Network:** a VPC with two public subnets (the VM) and two private subnets (the database).
  No NAT gateway: the VM has a public IP for outbound API calls; the database has no route
  to the internet. Only ports 80/443 are open; administration is through SSM Session Manager
  (no SSH keys).
- **Compute:** one `t3a.medium` (2 vCPU, 4 GB) running Docker Compose: Caddy (TLS from Let's
  Encrypt, HTTP → HTTPS), web, worker and ClamAV. x86 rather than Graviton so CI builds the
  image natively. CloudWatch recovers the VM on hardware failure.
- **Database:** RDS PostgreSQL 16 `db.t4g.micro`, encrypted, private, TLS required, 30-day
  automated backups with point-in-time recovery, deletion protection in production. The
  master password is created by RDS in Secrets Manager and never appears in state; its
  automatic weekly rotation is turned off, because the app reads its connection string at
  deploy time and a silent rotation would break new connections. Rotate by hand, then
  redeploy.
- **Files:** a private S3 bucket (TLS only, versioned, old versions removed after 30 days),
  encrypted with S3-managed keys (a customer-managed KMS key is optional hardening, Q-39);
  the app's new S3 `FileStorage` adapter uses the VM's role, so there are no keys.
- **Containers:** read-only filesystems, `no-new-privileges`, non-root app user; the server
  needs IMDSv2 and its role can only read its own parameters, secret, bucket and image.
- **Email:** Amazon SES through the existing SMTP sender (SMTP credentials in Parameter Store).
  One SES identity per domain, so staging sends from a subdomain.
- **Secrets and config:** SSM Parameter Store (`/creator-platform/<env>/…`). OpenTofu creates
  secret parameters with a placeholder and never stores their values; the deploy script
  refuses to start while any placeholder remains.
- **Images and deploys:** one ECR repository; GitHub Actions (OIDC, no stored AWS keys) builds
  the image once, deploys it to staging, then the same image to production after approval.
  Deploys run migrations, then restart the containers, through SSM Run Command.
- **Monitoring:** container logs in CloudWatch (30 days); alarms for app alerts and errors,
  database CPU, storage and memory, VM health; a monthly AWS budget alert (NFR-13). All go to
  an SNS topic emailed to the operations address.

## Consequences

- About $50/month for production; staging costs the same while it runs and can be destroyed
  between releases (`tofu destroy`; its database is disposable).
- One VM is a single point of failure: a deploy or VM failure means a few minutes of downtime
  (NFR-2 at pilot scale). Moving to ECS Fargate + ALB later reuses the same image, database,
  bucket and parameters; only the compute part of `infra/` changes.
- The app connects as the RDS master user. A separate least-privilege database user is a
  follow-up (Q-38).
