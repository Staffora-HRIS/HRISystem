# Infrastructure as Code (Terraform)

> **Implementation Status:** PLANNED — This document describes the target Terraform infrastructure. The terraform/ directory and modules have not yet been created.

*Last updated: 2026-03-21*
*Document owner: Platform Engineering*
*Review cadence: Quarterly*

---

## 1. Overview

Staffora's infrastructure is managed declaratively using Terraform. All VPS provisioning, DNS records, firewall rules, and supporting resources are defined as code, version-controlled, and applied via CI/CD.

### Principles

- **Everything in code**: No manual resource creation via cloud consoles
- **Plan on PR, apply on merge**: All changes are reviewed before they reach production
- **Remote state**: Terraform state stored in S3 with locking via DynamoDB
- **Environment parity**: Staging and production use the same Terraform modules with different variables

### Infrastructure Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        DNS (Cloudflare)                        │
│  staffora.co.uk → production VPS                               │
│  staging.staffora.co.uk → staging VPS                          │
│  *.staffora.co.uk → production VPS (wildcard for tenants)      │
└───────────────────────────┬────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
     ┌────────┴────────┐        ┌────────┴────────┐
     │   Production    │        │    Staging       │
     │   VPS (Hetzner) │        │   VPS (Hetzner)  │
     │                 │        │                  │
     │  nginx (WAF)    │        │  nginx (WAF)     │
     │  API x2-8       │        │  API x2          │
     │  Worker x1-4    │        │  Worker x1       │
     │  Web x1         │        │  Web x1          │
     │  PostgreSQL     │        │  PostgreSQL      │
     │  PgBouncer      │        │  PgBouncer       │
     │  Redis          │        │  Redis           │
     └────────┬────────┘        └────────┬────────┘
              │                           │
              └─────────────┬─────────────┘
                            │
                  ┌─────────┴─────────┐
                  │    S3 (Backups)   │
                  │    eu-west-2      │
                  └───────────────────┘
```

---

## 2. Module Structure

```
terraform/
├── modules/
│   ├── vps/                    # VPS provisioning (Hetzner or AWS)
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── cloud-init.yaml
│   ├── dns/                    # DNS records (Cloudflare)
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── firewall/               # Firewall rules
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── backup/                 # S3 bucket for database backups
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── monitoring/             # Uptime monitoring resources
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
├── environments/
│   ├── staging/
│   │   ├── main.tf             # Staging environment root
│   │   ├── variables.tf
│   │   ├── terraform.tfvars
│   │   └── backend.tf          # Remote state config
│   └── production/
│       ├── main.tf             # Production environment root
│       ├── variables.tf
│       ├── terraform.tfvars
│       └── backend.tf          # Remote state config
├── .terraform.lock.hcl         # Provider lock file
└── README.md
```

---

## 3. Remote State Configuration

Terraform state is stored in S3 with DynamoDB locking to prevent concurrent modifications.

### `environments/production/backend.tf`

```hcl
# =============================================================================
# Remote State — Production
# =============================================================================
# State is stored in S3 (eu-west-2 for UK data residency) with DynamoDB
# locking to prevent concurrent terraform apply operations.
# =============================================================================

terraform {
  backend "s3" {
    bucket         = "staffora-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "eu-west-2"
    encrypt        = true
    dynamodb_table = "staffora-terraform-locks"

    # Tags for cost allocation
    tags = {
      Project     = "staffora"
      Environment = "production"
      ManagedBy   = "terraform"
    }
  }
}
```

### `environments/staging/backend.tf`

```hcl
terraform {
  backend "s3" {
    bucket         = "staffora-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "eu-west-2"
    encrypt        = true
    dynamodb_table = "staffora-terraform-locks"

    tags = {
      Project     = "staffora"
      Environment = "staging"
      ManagedBy   = "terraform"
    }
  }
}
```

### Bootstrap the State Backend

The S3 bucket and DynamoDB table must be created once before Terraform can use them. Use this bootstrap script:

```bash
#!/usr/bin/env bash
# bootstrap-terraform-state.sh — One-time setup for remote state
set -euo pipefail

AWS_REGION="eu-west-2"

# Create S3 bucket for state
aws s3api create-bucket \
  --bucket staffora-terraform-state \
  --region "$AWS_REGION" \
  --create-bucket-configuration LocationConstraint="$AWS_REGION"

# Enable versioning (allows state recovery)
aws s3api put-bucket-versioning \
  --bucket staffora-terraform-state \
  --versioning-configuration Status=Enabled

# Enable server-side encryption
aws s3api put-bucket-encryption \
  --bucket staffora-terraform-state \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "aws:kms"}}]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket staffora-terraform-state \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name staffora-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$AWS_REGION"

echo "Terraform state backend created."
```

---

## 4. VPS Module

### `modules/vps/main.tf`

```hcl
# =============================================================================
# VPS Module — Provisions a server for running Staffora
# =============================================================================
# Supports Hetzner Cloud (primary) and AWS EC2 (alternative).
# The server is provisioned with cloud-init which installs Docker,
# clones the repository, and starts the platform.
# =============================================================================

terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

# ---------------------------------------------------------------------------
# SSH Key
# ---------------------------------------------------------------------------
resource "hcloud_ssh_key" "deploy" {
  name       = "staffora-${var.environment}-deploy"
  public_key = var.ssh_public_key
}

# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------
resource "hcloud_server" "staffora" {
  name        = "staffora-${var.environment}"
  image       = "ubuntu-24.04"
  server_type = var.server_type
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.deploy.id]

  user_data = templatefile("${path.module}/cloud-init.yaml", {
    environment     = var.environment
    docker_version  = var.docker_version
    deploy_ssh_key  = var.ssh_public_key
    hostname        = "staffora-${var.environment}"
  })

  labels = {
    project     = "staffora"
    environment = var.environment
    managed_by  = "terraform"
  }

  # Prevent accidental deletion of production servers
  delete_protection  = var.environment == "production" ? true : false
  rebuild_protection = var.environment == "production" ? true : false

  lifecycle {
    # Changing user_data requires server rebuild — prevent accidental rebuilds
    ignore_changes = [user_data]
  }
}

# ---------------------------------------------------------------------------
# Volumes (persistent storage for database and backups)
# ---------------------------------------------------------------------------
resource "hcloud_volume" "data" {
  name      = "staffora-${var.environment}-data"
  size      = var.data_volume_size_gb
  location  = var.location
  format    = "ext4"

  labels = {
    project     = "staffora"
    environment = var.environment
    purpose     = "database-and-backups"
  }

  delete_protection = var.environment == "production" ? true : false
}

resource "hcloud_volume_attachment" "data" {
  volume_id = hcloud_volume.data.id
  server_id = hcloud_server.staffora.id
  automount = true
}

# ---------------------------------------------------------------------------
# Reverse DNS
# ---------------------------------------------------------------------------
resource "hcloud_rdns" "ipv4" {
  server_id  = hcloud_server.staffora.id
  ip_address = hcloud_server.staffora.ipv4_address
  dns_ptr    = var.domain
}
```

### `modules/vps/variables.tf`

```hcl
variable "environment" {
  description = "Environment name (staging or production)"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'."
  }
}

variable "server_type" {
  description = "Hetzner server type"
  type        = string
  default     = "cpx31"  # 4 vCPU, 8GB RAM, 160GB disk
}

variable "location" {
  description = "Hetzner data centre location"
  type        = string
  default     = "fsn1"  # Falkenstein, Germany (closest EU location to UK)
}

variable "domain" {
  description = "Primary domain for reverse DNS"
  type        = string
}

variable "ssh_public_key" {
  description = "SSH public key for deploy access"
  type        = string
}

variable "docker_version" {
  description = "Docker Engine version to install"
  type        = string
  default     = "26.1"
}

variable "data_volume_size_gb" {
  description = "Size of the persistent data volume in GB"
  type        = number
  default     = 100
}
```

### `modules/vps/outputs.tf`

```hcl
output "server_id" {
  description = "Hetzner server ID"
  value       = hcloud_server.staffora.id
}

output "ipv4_address" {
  description = "Server IPv4 address"
  value       = hcloud_server.staffora.ipv4_address
}

output "ipv6_address" {
  description = "Server IPv6 address"
  value       = hcloud_server.staffora.ipv6_address
}

output "volume_id" {
  description = "Data volume ID"
  value       = hcloud_volume.data.id
}
```

### `modules/vps/cloud-init.yaml`

```yaml
#cloud-config
# =============================================================================
# Staffora Cloud-Init — Server Bootstrap
# =============================================================================
# Runs on first boot to configure the server with Docker, security hardening,
# and the Staffora deployment directory structure.
# =============================================================================

hostname: ${hostname}

# System packages
package_update: true
package_upgrade: true
packages:
  - curl
  - git
  - jq
  - htop
  - unattended-upgrades
  - fail2ban
  - ufw
  - ca-certificates
  - gnupg
  - lsb-release
  - bc
  - python3

# Docker installation
runcmd:
  # Install Docker
  - curl -fsSL https://get.docker.com | VERSION=${docker_version} sh
  - systemctl enable docker
  - systemctl start docker

  # Install Docker Compose plugin
  - apt-get install -y docker-compose-plugin

  # Create deploy user
  - useradd -m -s /bin/bash -G docker deploy
  - mkdir -p /home/deploy/.ssh
  - echo "${deploy_ssh_key}" >> /home/deploy/.ssh/authorized_keys
  - chmod 700 /home/deploy/.ssh
  - chmod 600 /home/deploy/.ssh/authorized_keys
  - chown -R deploy:deploy /home/deploy/.ssh

  # Harden SSH
  - sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
  - sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
  - systemctl restart sshd

  # Configure firewall
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp    # SSH
  - ufw allow 80/tcp    # HTTP
  - ufw allow 443/tcp   # HTTPS
  - ufw --force enable

  # Configure fail2ban
  - systemctl enable fail2ban
  - systemctl start fail2ban

  # Create Staffora directory structure
  - mkdir -p /opt/staffora/{blue,green,shared,scripts,nginx}
  - mkdir -p /var/log/staffora
  - chown -R deploy:deploy /opt/staffora /var/log/staffora

  # Mount data volume (if not auto-mounted)
  - |
    if ! mountpoint -q /opt/staffora/data; then
      mkdir -p /opt/staffora/data
      VOLUME_DEV=$(lsblk -o NAME,LABEL -n | grep -v "^[a-z]" | awk '{print "/dev/"$1}' | tail -1)
      if [ -n "$VOLUME_DEV" ]; then
        mount "$VOLUME_DEV" /opt/staffora/data
        echo "$VOLUME_DEV /opt/staffora/data ext4 defaults 0 2" >> /etc/fstab
      fi
    fi

  # Enable automatic security updates
  - |
    cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'CONF'
    Unattended-Upgrade::Allowed-Origins {
      "$${distro_id}:$${distro_codename}-security";
    };
    Unattended-Upgrade::AutoFixInterruptedDpkg "true";
    Unattended-Upgrade::MinimalSteps "true";
    Unattended-Upgrade::Remove-Unused-Dependencies "true";
    Unattended-Upgrade::Automatic-Reboot "false";
    CONF

  # Set up Docker log rotation
  - |
    cat > /etc/docker/daemon.json << 'CONF'
    {
      "log-driver": "json-file",
      "log-opts": {
        "max-size": "50m",
        "max-file": "5"
      },
      "storage-driver": "overlay2"
    }
    CONF
  - systemctl restart docker

  # Log setup complete
  - echo "Staffora ${environment} server provisioned at $(date -u)" >> /var/log/staffora/provision.log
```

---

## 5. DNS Module

### `modules/dns/main.tf`

```hcl
# =============================================================================
# DNS Module — Cloudflare DNS records for Staffora
# =============================================================================

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

# ---------------------------------------------------------------------------
# A Records
# ---------------------------------------------------------------------------
resource "cloudflare_record" "root" {
  zone_id = var.cloudflare_zone_id
  name    = var.environment == "production" ? "app" : "staging"
  content = var.server_ipv4
  type    = "A"
  ttl     = 300
  proxied = var.cloudflare_proxy_enabled

  comment = "Staffora ${var.environment} — managed by Terraform"
}

# API subdomain (same server, different routing via nginx)
resource "cloudflare_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = var.environment == "production" ? "api" : "api.staging"
  content = var.server_ipv4
  type    = "A"
  ttl     = 300
  proxied = var.cloudflare_proxy_enabled

  comment = "Staffora API ${var.environment} — managed by Terraform"
}

# ---------------------------------------------------------------------------
# AAAA Records (IPv6)
# ---------------------------------------------------------------------------
resource "cloudflare_record" "root_ipv6" {
  count   = var.server_ipv6 != "" ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = var.environment == "production" ? "app" : "staging"
  content = var.server_ipv6
  type    = "AAAA"
  ttl     = 300
  proxied = var.cloudflare_proxy_enabled

  comment = "Staffora ${var.environment} IPv6 — managed by Terraform"
}

# ---------------------------------------------------------------------------
# MX Records (email delivery for notifications)
# ---------------------------------------------------------------------------
resource "cloudflare_record" "mx_primary" {
  count    = var.environment == "production" ? 1 : 0
  zone_id  = var.cloudflare_zone_id
  name     = "staffora.co.uk"
  content  = var.mx_primary
  type     = "MX"
  ttl      = 3600
  priority = 10

  comment = "Primary MX — managed by Terraform"
}

# ---------------------------------------------------------------------------
# TXT Records (SPF, DKIM, DMARC)
# ---------------------------------------------------------------------------
resource "cloudflare_record" "spf" {
  count   = var.environment == "production" ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = "staffora.co.uk"
  content = var.spf_record
  type    = "TXT"
  ttl     = 3600

  comment = "SPF record — managed by Terraform"
}

resource "cloudflare_record" "dmarc" {
  count   = var.environment == "production" ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = "_dmarc"
  content = var.dmarc_record
  type    = "TXT"
  ttl     = 3600

  comment = "DMARC policy — managed by Terraform"
}

# ---------------------------------------------------------------------------
# CAA Record (restrict certificate issuance)
# ---------------------------------------------------------------------------
resource "cloudflare_record" "caa" {
  count   = var.environment == "production" ? 1 : 0
  zone_id = var.cloudflare_zone_id
  name    = "staffora.co.uk"
  type    = "CAA"
  ttl     = 3600

  data {
    flags = "0"
    tag   = "issue"
    value = "letsencrypt.org"
  }

  comment = "CAA — only Let's Encrypt may issue certs — managed by Terraform"
}
```

### `modules/dns/variables.tf`

```hcl
variable "environment" {
  description = "Environment name (staging or production)"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for staffora.co.uk"
  type        = string
  sensitive   = true
}

variable "server_ipv4" {
  description = "Server IPv4 address"
  type        = string
}

variable "server_ipv6" {
  description = "Server IPv6 address (optional)"
  type        = string
  default     = ""
}

variable "cloudflare_proxy_enabled" {
  description = "Enable Cloudflare proxy (orange cloud)"
  type        = bool
  default     = true
}

variable "mx_primary" {
  description = "Primary MX server hostname"
  type        = string
  default     = ""
}

variable "spf_record" {
  description = "SPF TXT record value"
  type        = string
  default     = "v=spf1 include:_spf.google.com ~all"
}

variable "dmarc_record" {
  description = "DMARC TXT record value"
  type        = string
  default     = "v=DMARC1; p=quarantine; rua=mailto:dmarc@staffora.co.uk"
}
```

### `modules/dns/outputs.tf`

```hcl
output "app_fqdn" {
  description = "Application FQDN"
  value       = cloudflare_record.root.hostname
}

output "api_fqdn" {
  description = "API FQDN"
  value       = cloudflare_record.api.hostname
}
```

---

## 6. Firewall Module

### `modules/firewall/main.tf`

```hcl
# =============================================================================
# Firewall Module — Hetzner Cloud Firewall
# =============================================================================

terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
  }
}

resource "hcloud_firewall" "staffora" {
  name = "staffora-${var.environment}"

  labels = {
    project     = "staffora"
    environment = var.environment
    managed_by  = "terraform"
  }

  # SSH (restricted to known IPs)
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = var.ssh_allowed_ips
  }

  # HTTP (open for redirect to HTTPS)
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # HTTPS (open)
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # ICMP (ping for monitoring)
  rule {
    direction  = "in"
    protocol   = "icmp"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # Deny all other inbound traffic (implicit in Hetzner firewall)
}

# Attach firewall to server
resource "hcloud_firewall_attachment" "staffora" {
  firewall_id = hcloud_firewall.staffora.id
  server_ids  = var.server_ids
}
```

### `modules/firewall/variables.tf`

```hcl
variable "environment" {
  description = "Environment name"
  type        = string
}

variable "ssh_allowed_ips" {
  description = "List of CIDR blocks allowed SSH access"
  type        = list(string)
  default     = []  # Must be explicitly set — no default SSH access
}

variable "server_ids" {
  description = "List of Hetzner server IDs to attach the firewall to"
  type        = list(number)
}
```

---

## 7. Backup Module

### `modules/backup/main.tf`

```hcl
# =============================================================================
# Backup Module — S3 bucket for database backups
# =============================================================================

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

resource "aws_s3_bucket" "backups" {
  bucket = "staffora-${var.environment}-backups"

  tags = {
    Project     = "staffora"
    Environment = var.environment
    ManagedBy   = "terraform"
    Purpose     = "database-backups"
  }
}

# Enable versioning for backup recovery
resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "backups" {
  bucket = aws_s3_bucket.backups.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle rules for backup retention
resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  # Daily backups — keep for 30 days
  rule {
    id     = "daily-retention"
    status = "Enabled"

    filter {
      prefix = "daily/"
    }

    expiration {
      days = 30
    }

    transition {
      days          = 7
      storage_class = "STANDARD_IA"
    }
  }

  # Weekly backups — keep for 90 days
  rule {
    id     = "weekly-retention"
    status = "Enabled"

    filter {
      prefix = "weekly/"
    }

    expiration {
      days = 90
    }

    transition {
      days          = 14
      storage_class = "STANDARD_IA"
    }
  }

  # Monthly backups — keep for 365 days
  rule {
    id     = "monthly-retention"
    status = "Enabled"

    filter {
      prefix = "monthly/"
    }

    expiration {
      days = 365
    }

    transition {
      days          = 30
      storage_class = "GLACIER"
    }
  }
}

# IAM user for backup sidecar
resource "aws_iam_user" "backup" {
  name = "staffora-${var.environment}-backup"
  path = "/system/"

  tags = {
    Project     = "staffora"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_iam_user_policy" "backup" {
  name = "staffora-${var.environment}-backup-policy"
  user = aws_iam_user.backup.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:DeleteObject"
        ]
        Resource = [
          aws_s3_bucket.backups.arn,
          "${aws_s3_bucket.backups.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_access_key" "backup" {
  user = aws_iam_user.backup.name
}
```

### `modules/backup/variables.tf`

```hcl
variable "environment" {
  description = "Environment name"
  type        = string
}
```

### `modules/backup/outputs.tf`

```hcl
output "bucket_name" {
  description = "S3 bucket name for backups"
  value       = aws_s3_bucket.backups.id
}

output "bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.backups.arn
}

output "backup_access_key_id" {
  description = "IAM access key ID for backup sidecar"
  value       = aws_iam_access_key.backup.id
  sensitive   = true
}

output "backup_secret_access_key" {
  description = "IAM secret access key for backup sidecar"
  value       = aws_iam_access_key.backup.secret
  sensitive   = true
}
```

---

## 8. Production Environment Root

### `environments/production/main.tf`

```hcl
# =============================================================================
# Staffora Production Environment
# =============================================================================

terraform {
  required_version = ">= 1.7.0"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.45"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ---------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------
provider "hcloud" {
  token = var.hcloud_token
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

provider "aws" {
  region = "eu-west-2"  # London — UK data residency
}

# ---------------------------------------------------------------------------
# VPS
# ---------------------------------------------------------------------------
module "vps" {
  source = "../../modules/vps"

  environment         = "production"
  server_type         = var.server_type
  location            = "fsn1"
  domain              = "app.staffora.co.uk"
  ssh_public_key      = var.ssh_public_key
  docker_version      = "26.1"
  data_volume_size_gb = 200
}

# ---------------------------------------------------------------------------
# DNS
# ---------------------------------------------------------------------------
module "dns" {
  source = "../../modules/dns"

  environment          = "production"
  cloudflare_zone_id   = var.cloudflare_zone_id
  server_ipv4          = module.vps.ipv4_address
  server_ipv6          = module.vps.ipv6_address
  cloudflare_proxy_enabled = true
  mx_primary           = var.mx_primary
  spf_record           = var.spf_record
  dmarc_record         = var.dmarc_record
}

# ---------------------------------------------------------------------------
# Firewall
# ---------------------------------------------------------------------------
module "firewall" {
  source = "../../modules/firewall"

  environment    = "production"
  server_ids     = [module.vps.server_id]
  ssh_allowed_ips = var.ssh_allowed_ips
}

# ---------------------------------------------------------------------------
# Backup Storage
# ---------------------------------------------------------------------------
module "backup" {
  source = "../../modules/backup"

  environment = "production"
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------
output "server_ip" {
  description = "Production server IP address"
  value       = module.vps.ipv4_address
}

output "app_url" {
  description = "Production application URL"
  value       = "https://${module.dns.app_fqdn}"
}

output "api_url" {
  description = "Production API URL"
  value       = "https://${module.dns.api_fqdn}"
}

output "backup_bucket" {
  description = "S3 bucket for database backups"
  value       = module.backup.bucket_name
}
```

### `environments/production/variables.tf`

```hcl
variable "hcloud_token" {
  description = "Hetzner Cloud API token"
  type        = string
  sensitive   = true
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with DNS edit permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for staffora.co.uk"
  type        = string
  sensitive   = true
}

variable "ssh_public_key" {
  description = "SSH public key for deploy access"
  type        = string
}

variable "ssh_allowed_ips" {
  description = "CIDR blocks allowed SSH access to production"
  type        = list(string)
}

variable "server_type" {
  description = "Hetzner server type for production"
  type        = string
  default     = "cpx41"  # 8 vCPU, 16GB RAM, 240GB disk
}

variable "mx_primary" {
  description = "Primary MX server"
  type        = string
  default     = ""
}

variable "spf_record" {
  description = "SPF TXT record"
  type        = string
  default     = "v=spf1 include:_spf.google.com ~all"
}

variable "dmarc_record" {
  description = "DMARC TXT record"
  type        = string
  default     = "v=DMARC1; p=quarantine; rua=mailto:dmarc@staffora.co.uk"
}
```

### `environments/production/terraform.tfvars`

```hcl
# =============================================================================
# Production Environment Variables
# =============================================================================
# Sensitive values (tokens, keys) are set via environment variables:
#   export TF_VAR_hcloud_token="..."
#   export TF_VAR_cloudflare_api_token="..."
#   export TF_VAR_cloudflare_zone_id="..."
# =============================================================================

server_type = "cpx41"  # 8 vCPU, 16GB RAM, 240GB disk

ssh_public_key = "ssh-ed25519 AAAA... deploy@staffora"

ssh_allowed_ips = [
  # Office IP
  # "203.0.113.10/32",
  # VPN
  # "198.51.100.0/24",
]
```

---

## 9. CI/CD Integration

### GitHub Actions Workflow: `terraform-plan.yml`

```yaml
name: Terraform Plan

on:
  pull_request:
    paths:
      - 'terraform/**'

permissions:
  contents: read
  pull-requests: write

jobs:
  plan:
    name: Terraform Plan (${{ matrix.environment }})
    runs-on: ubuntu-latest
    strategy:
      matrix:
        environment: [staging, production]

    defaults:
      run:
        working-directory: terraform/environments/${{ matrix.environment }}

    env:
      TF_VAR_hcloud_token: ${{ secrets.HCLOUD_TOKEN }}
      TF_VAR_cloudflare_api_token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      TF_VAR_cloudflare_zone_id: ${{ secrets.CLOUDFLARE_ZONE_ID }}
      AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      AWS_REGION: eu-west-2

    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.7.5"

      - name: Terraform Init
        run: terraform init -input=false

      - name: Terraform Validate
        run: terraform validate

      - name: Terraform Plan
        id: plan
        run: terraform plan -input=false -no-color -out=tfplan
        continue-on-error: true

      - name: Comment PR with plan
        uses: actions/github-script@v7
        with:
          script: |
            const output = `### Terraform Plan: \`${{ matrix.environment }}\`

            \`\`\`
            ${{ steps.plan.outputs.stdout }}
            \`\`\`

            *Pushed by: @${{ github.actor }}, Action: \`${{ github.event_name }}\`*`;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: output
            })

      - name: Fail on plan error
        if: steps.plan.outcome == 'failure'
        run: exit 1
```

### GitHub Actions Workflow: `terraform-apply.yml`

```yaml
name: Terraform Apply

on:
  push:
    branches: [main]
    paths:
      - 'terraform/**'

permissions:
  contents: read

jobs:
  apply:
    name: Terraform Apply (${{ matrix.environment }})
    runs-on: ubuntu-latest
    environment: ${{ matrix.environment }}
    strategy:
      max-parallel: 1  # Apply staging first, then production
      matrix:
        environment: [staging, production]

    defaults:
      run:
        working-directory: terraform/environments/${{ matrix.environment }}

    env:
      TF_VAR_hcloud_token: ${{ secrets.HCLOUD_TOKEN }}
      TF_VAR_cloudflare_api_token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      TF_VAR_cloudflare_zone_id: ${{ secrets.CLOUDFLARE_ZONE_ID }}
      AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
      AWS_REGION: eu-west-2

    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.7.5"

      - name: Terraform Init
        run: terraform init -input=false

      - name: Terraform Apply
        run: terraform apply -input=false -auto-approve

      - name: Summary
        if: always()
        run: |
          echo "## Terraform Apply: ${{ matrix.environment }}" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "- **Status**: ${{ job.status }}" >> $GITHUB_STEP_SUMMARY
          echo "- **Commit**: \`${GITHUB_SHA::8}\`" >> $GITHUB_STEP_SUMMARY
```

---

## 10. Common Operations

### Initialise a New Environment

```bash
cd terraform/environments/staging

# Set secrets via environment variables
export TF_VAR_hcloud_token="hc_..."
export TF_VAR_cloudflare_api_token="..."
export TF_VAR_cloudflare_zone_id="..."
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."

# Initialise and apply
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

### Import Existing Resources

If resources were created manually before Terraform adoption:

```bash
# Import an existing Hetzner server
terraform import module.vps.hcloud_server.staffora 12345678

# Import an existing Cloudflare DNS record
terraform import module.dns.cloudflare_record.root <zone_id>/<record_id>
```

### Destroy an Environment

```bash
# DANGER: Only for staging — production has delete_protection enabled
cd terraform/environments/staging
terraform destroy
```

---

## Related Documentation

- [Docs/operations/blue-green-deployment.md](blue-green-deployment.md) -- Deployment strategy
- [Docs/operations/disaster-recovery.md](disaster-recovery.md) -- Recovery procedures
- [Docs/operations/backup-verification.md](backup-verification.md) -- Backup verification
- [Docs/operations/secret-rotation.md](secret-rotation.md) -- Secret rotation procedures
- [Docs/devops/ci-cd.md](../devops/ci-cd.md) -- CI/CD pipeline documentation
