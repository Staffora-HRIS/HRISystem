# SSL/TLS Certificate Management

*Last updated: 2026-03-28*

Staffora uses Let's Encrypt for automated TLS certificate provisioning and renewal. Certificates are managed by a certbot container that runs alongside nginx in the production Docker Compose profile.

## Architecture

```
                        +------------------+
                        |  Let's Encrypt   |
                        |  ACME Server     |
                        +--------+---------+
                                 |
                    HTTP-01 challenge validation
                                 |
                        +--------v---------+
   Port 80 ----------->|      Nginx       |-----------> Port 443
   (ACME challenges)   | (reverse proxy)  |   (HTTPS traffic)
                        +--------+---------+
                                 |
                    Shared volume: certbot-conf
                                 |
                        +--------v---------+
                        |     Certbot      |
                        | (renewal every   |
                        |    12 hours)     |
                        +------------------+
```

### How It Works

1. **HTTP-01 Validation**: Certbot places challenge tokens in a shared webroot volume. Nginx serves these files at `/.well-known/acme-challenge/` over plain HTTP (port 80). Let's Encrypt validates domain ownership by requesting these tokens.

2. **Certificate Storage**: Certificates are stored in the `certbot-conf` Docker volume, mounted at `/etc/letsencrypt` in both the nginx and certbot containers.

3. **Automatic Renewal**: The certbot container runs a renewal check every 12 hours. Certbot only attempts renewal when a certificate is within 30 days of expiry. After successful renewal, nginx is reloaded via a deploy hook.

4. **Domains Covered**: A single SAN (Subject Alternative Name) certificate covers both:
   - `staffora.co.uk` (main application)
   - `api.staffora.co.uk` (API subdomain)

## Initial Setup

### Prerequisites

- Docker and Docker Compose V2 installed
- DNS A records for `staffora.co.uk` and `api.staffora.co.uk` pointing to the server
- Port 80 open and reachable from the internet (required for HTTP-01 challenges)
- Port 443 open for HTTPS traffic

### First-Time Certificate Provisioning

The `init-letsencrypt.sh` script handles the entire first-time setup:

```bash
# 1. Test with staging certificates first (not rate-limited)
./scripts/init-letsencrypt.sh --staging

# 2. Verify the staging certificate works
curl -vI https://staffora.co.uk 2>&1 | grep "issuer"
# Should show: issuer: C=US; O=(STAGING) Let's Encrypt; ...

# 3. Once verified, obtain production certificates
#    (remove staging certs first)
rm -rf docker/certbot/conf/live/staffora.co.uk
rm -rf docker/certbot/conf/renewal/staffora.co.uk.conf
rm -rf docker/certbot/conf/archive/staffora.co.uk

./scripts/init-letsencrypt.sh

# 4. Verify the production certificate
curl -vI https://staffora.co.uk 2>&1 | grep "issuer"
# Should show: issuer: C=US; O=Let's Encrypt; CN=R3
```

### What the Script Does

1. Creates the `docker/certbot/conf` and `docker/certbot/www` directories
2. Downloads recommended TLS parameters from certbot
3. Generates Diffie-Hellman parameters (2048-bit)
4. Creates a temporary self-signed certificate so nginx can start
5. Starts nginx to serve ACME challenges
6. Runs certbot to request the real certificate
7. Reloads nginx with the Let's Encrypt certificate

### Script Options

| Flag | Description |
|------|-------------|
| `--staging` | Use Let's Encrypt staging server (unlimited requests, untrusted certs) |
| `--dry-run` | Simulate without issuing any certificates |
| `--email ADDR` | Override the notification email (default: `admin@staffora.co.uk`) |
| `--domains STR` | Override domains (space-separated, default: `staffora.co.uk api.staffora.co.uk`) |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CERTBOT_DOMAINS` | `staffora.co.uk api.staffora.co.uk` | Space-separated list of domains |
| `CERTBOT_EMAIL` | `admin@staffora.co.uk` | Email for expiry notifications |
| `COMPOSE_FILE` | `docker/docker-compose.yml` | Path to docker-compose file |

## Docker Compose Configuration

The certbot service is defined in `docker/docker-compose.yml` under the `production` profile:

```yaml
# Start all production services including certbot
docker compose -f docker/docker-compose.yml --profile production up -d
```

### Services Involved

| Service | Role |
|---------|------|
| `nginx` | Serves ACME challenges, terminates TLS, reverse proxies to API/web |
| `certbot` | Requests and renews certificates, runs every 12 hours |

### Shared Volumes

| Volume | Mounted In | Path | Purpose |
|--------|------------|------|---------|
| `certbot-conf` | nginx, certbot | `/etc/letsencrypt` | Certificate files, renewal configs |
| `certbot-www` | nginx, certbot | `/var/www/certbot` | HTTP-01 challenge webroot |

## Certificate Renewal

### Automatic Renewal

The certbot container runs this loop:

```
while true:
    certbot renew          # Only renews if within 30 days of expiry
    sleep 43200            # 12 hours
```

After successful renewal, the deploy hook in `docker/certbot/cli.ini` reloads nginx:

```
deploy-hook = nginx -s reload || true
```

Let's Encrypt certificates are valid for 90 days. With the 12-hour check interval, renewal typically happens around day 60 (30 days before expiry).

### Manual Renewal

If automatic renewal fails, you can trigger it manually:

```bash
# Check renewal status (dry run)
docker compose -f docker/docker-compose.yml --profile production \
    exec certbot certbot renew --dry-run

# Force renewal
docker compose -f docker/docker-compose.yml --profile production \
    exec certbot certbot renew --force-renewal

# Reload nginx after manual renewal
docker compose -f docker/docker-compose.yml --profile production \
    exec nginx nginx -s reload
```

### Checking Certificate Expiry

```bash
# From the host
echo | openssl s_client -servername staffora.co.uk -connect staffora.co.uk:443 2>/dev/null \
    | openssl x509 -noout -dates

# From inside the certbot container
docker compose -f docker/docker-compose.yml --profile production \
    exec certbot certbot certificates
```

## Nginx Configuration

### HTTP (Port 80)

- Serves `/.well-known/acme-challenge/` for Let's Encrypt validation
- Serves `/health` for load balancer health checks (no redirect)
- Redirects everything else to HTTPS with `301 Moved Permanently`

### HTTPS (Port 443)

Two server blocks:

1. **`staffora.co.uk`** -- Full application (frontend + API via `/api/` prefix)
2. **`api.staffora.co.uk`** -- Dedicated API subdomain (all routes proxied to API backend)

### TLS Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| Protocols | TLSv1.2 + TLSv1.3 | TLS 1.0/1.1 are deprecated (RFC 8996) |
| Key size | RSA 4096 | Stronger security, acceptable performance |
| Session cache | 50 MB shared | Reduces TLS handshake overhead |
| Session tickets | Off | Prevents forward secrecy bypass |
| HSTS | 2 years, includeSubDomains, preload | Strict transport security |
| DH parameters | 2048-bit | Minimum safe size for DHE key exchange |
| Preferred chain | ISRG Root X1 | Avoids expired DST Root CA X3 |

## Troubleshooting

### Certificate Request Fails

**Symptom**: `certbot certonly` exits with an error.

**Common causes**:

1. **DNS not pointing to server**: Verify with `dig +short staffora.co.uk` -- must return your server IP.

2. **Port 80 blocked**: Verify with `curl http://staffora.co.uk/.well-known/acme-challenge/test` from an external machine.

3. **Rate limit exceeded**: Let's Encrypt has a limit of 5 duplicate certificates per week. Use `--staging` for testing.

4. **Firewall blocking outbound**: Certbot needs to reach `acme-v02.api.letsencrypt.org` over HTTPS.

### Nginx Fails to Start

**Symptom**: `nginx: [emerg] cannot load certificate`

**Cause**: Certificate files do not exist at the expected paths.

**Fix**: Run the init script to create temporary certificates:
```bash
./scripts/init-letsencrypt.sh --staging
```

Or create a temporary self-signed certificate manually:
```bash
mkdir -p docker/certbot/conf/live/staffora.co.uk
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout docker/certbot/conf/live/staffora.co.uk/privkey.pem \
    -out docker/certbot/conf/live/staffora.co.uk/fullchain.pem \
    -subj "/CN=localhost"
```

### Renewal Not Working

**Symptom**: Certificate expires despite certbot container running.

**Diagnostic steps**:

```bash
# 1. Check certbot container is running
docker compose -f docker/docker-compose.yml --profile production ps certbot

# 2. Check certbot logs for errors
docker compose -f docker/docker-compose.yml --profile production logs --tail=50 certbot

# 3. Test renewal manually
docker compose -f docker/docker-compose.yml --profile production \
    exec certbot certbot renew --dry-run

# 4. Verify ACME challenge path is accessible
curl -I http://staffora.co.uk/.well-known/acme-challenge/test
# Should return 404 (not 301 redirect)
```

### Certificate Chain Issues

**Symptom**: Some clients or older devices reject the certificate.

**Fix**: Ensure the preferred chain is set to ISRG Root X1:
```bash
docker compose -f docker/docker-compose.yml --profile production \
    exec certbot certbot renew --force-renewal --preferred-chain "ISRG Root X1"
```

## File Layout

```
docker/
  certbot/
    cli.ini              # Certbot renewal configuration (mounted at /etc/letsencrypt)
    conf/                # Certificate data (Docker volume, gitignored)
      live/
        staffora.co.uk/
          fullchain.pem  # Certificate + intermediate chain
          privkey.pem    # Private key
          cert.pem       # Certificate only
          chain.pem      # Intermediate chain only
      renewal/
        staffora.co.uk.conf  # Certbot renewal configuration
      archive/               # Historical certificate versions
      options-ssl-nginx.conf # Recommended TLS parameters
      ssl-dhparams.pem       # Diffie-Hellman parameters
    www/                 # ACME challenge webroot (Docker volume, gitignored)
  nginx/
    nginx.conf           # Nginx configuration with Let's Encrypt paths
    ssl/                 # Legacy SSL directory (superseded by certbot)

scripts/
  init-letsencrypt.sh    # First-time certificate provisioning
```

## Security Considerations

- **Private keys**: Never commit `docker/certbot/conf/` to version control. The directory is gitignored.
- **Rate limits**: Let's Encrypt allows 5 duplicate certificates and 50 certificates per registered domain per week. Always test with `--staging` first.
- **OCSP stapling**: Consider enabling `ssl_stapling` and `ssl_stapling_verify` in nginx.conf for improved TLS performance and privacy.
- **CAA records**: Add a DNS CAA record to restrict which CAs can issue certificates for your domain:
  ```
  staffora.co.uk.  IN  CAA  0  issue  "letsencrypt.org"
  ```
- **Certificate Transparency**: Let's Encrypt publishes all certificates to CT logs. This is normal and expected.

## Monitoring

### Prometheus Alerts (if monitoring profile is enabled)

Add these alerting rules to `docker/prometheus/alert-rules.yml`:

```yaml
- alert: SSLCertificateExpiringSoon
  expr: probe_ssl_earliest_cert_expiry - time() < 86400 * 14
  for: 1h
  labels:
    severity: warning
  annotations:
    summary: "SSL certificate expiring within 14 days"

- alert: SSLCertificateExpired
  expr: probe_ssl_earliest_cert_expiry - time() < 0
  for: 0m
  labels:
    severity: critical
  annotations:
    summary: "SSL certificate has expired"
```

### Let's Encrypt Email Notifications

Let's Encrypt sends email notifications at 20 days, 10 days, and 1 day before certificate expiry. These go to the email address provided during registration (default: `admin@staffora.co.uk`).

## Manual Fallback (Without Certbot Container)

If the certbot container is unavailable, you can manage certificates manually:

```bash
# Install certbot on the host
sudo apt install certbot

# Stop nginx temporarily
docker compose -f docker/docker-compose.yml --profile production stop nginx

# Request certificate (standalone mode)
sudo certbot certonly --standalone \
    -d staffora.co.uk \
    -d api.staffora.co.uk \
    --email admin@staffora.co.uk

# Copy certificates to the expected location
sudo cp /etc/letsencrypt/live/staffora.co.uk/fullchain.pem docker/certbot/conf/live/staffora.co.uk/
sudo cp /etc/letsencrypt/live/staffora.co.uk/privkey.pem docker/certbot/conf/live/staffora.co.uk/

# Restart nginx
docker compose -f docker/docker-compose.yml --profile production start nginx

# Set up a cron job for renewal
echo "0 0,12 * * * certbot renew --quiet && docker exec staffora-nginx nginx -s reload" \
    | sudo tee /etc/cron.d/certbot-renew
```
