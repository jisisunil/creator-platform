# One public subnet for the server (ADR-010). The database runs on the server and is reachable
# only on the containers' internal network, so there is no database subnet or NAT gateway.

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.name }
}

# Deny everything on the VPC's default security group; the server has its own.
resource "aws_default_security_group" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = local.name }
}

resource "aws_subnet" "public" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, 0)
  availability_zone = local.zone
  tags              = { Name = "${local.name}-public" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "server" {
  name        = "${local.name}-server"
  description = "App server: web traffic from anyone, no SSH (administration through SSM)"
  vpc_id      = aws_vpc.main.id
}

# trivy:ignore:AVD-AWS-0107 A public website must accept HTTP(S) from anywhere.
resource "aws_vpc_security_group_ingress_rule" "server_web" {
  for_each          = toset(["80", "443"])
  security_group_id = aws_security_group.server.id
  description       = "Public web traffic (80 redirects to 443)"
  ip_protocol       = "tcp"
  from_port         = tonumber(each.value)
  to_port           = tonumber(each.value)
  cidr_ipv4         = "0.0.0.0/0"
}

# The server calls YouTube, Instagram, SES, S3, ECR, Let's Encrypt, the CAPTCHA and the
# breached-password services (443), sends mail through SES (587) and installs packages (80).
# Without a NAT gateway there is no narrower route for these.
# trivy:ignore:AVD-AWS-0104
resource "aws_vpc_security_group_egress_rule" "server_internet" {
  for_each          = toset(["80", "443", "587"])
  security_group_id = aws_security_group.server.id
  description       = "Outbound to external APIs, AWS services and SES"
  ip_protocol       = "tcp"
  from_port         = tonumber(each.value)
  to_port           = tonumber(each.value)
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "server_dns" {
  for_each          = toset(["udp", "tcp"])
  security_group_id = aws_security_group.server.id
  description       = "DNS to the VPC resolver"
  ip_protocol       = each.value
  from_port         = 53
  to_port           = 53
  cidr_ipv4         = "${cidrhost(var.vpc_cidr, 2)}/32"
}
