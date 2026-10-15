# Two public subnets for the server and two private ones for the database (RDS needs two
# zones). No NAT gateway (ADR-009): the database never reaches the internet.

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.name }
}

# Deny everything on the VPC's default security group; resources use their own groups.
resource "aws_default_security_group" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = local.name }
}

resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone = local.zones[count.index]
  tags              = { Name = "${local.name}-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  availability_zone = local.zones[count.index]
  tags              = { Name = "${local.name}-private-${count.index}" }
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
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private subnets keep the VPC's main route table: local traffic only.

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

resource "aws_vpc_security_group_egress_rule" "server_database" {
  security_group_id            = aws_security_group.server.id
  description                  = "PostgreSQL to the database only"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.database.id
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

resource "aws_security_group" "database" {
  name        = "${local.name}-database"
  description = "PostgreSQL, reachable only from the app server"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "database_from_server" {
  security_group_id            = aws_security_group.database.id
  description                  = "PostgreSQL from the app server"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.server.id
}
