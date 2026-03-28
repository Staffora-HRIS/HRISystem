# SSL/TLS Certificate Expiry

*Last updated: 2026-03-28*

**Severity: P2 - High**
**Affected Components:** nginx Reverse Proxy, API HTTPS, Frontend HTTPS

## Symptoms / Detection

- Browser shows "Your connection is not private" / "NET::ERR_CERT_DATE_INVALID" errors.
- API clients receive TLS handshake failures or certificate validation errors.
- Monitoring alerts on certificate expiry within 30/14/7/1 days.
- `curl` returns `SSL certificate problem: certificate has expired`.
- Let's Encrypt renewal cron failed silently.

### Monitoring Commands

```bash
# Check certificate expiry date from the running nginx
echo | openssl s_client -servername staffora.co.uk -connect localhost:443 2>/dev/null | openssl x509 -noout -dates

# Check days until expiry
echo | openssl s_client -servername staffora.co.uk -connect localhost:443 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2 | xargs -I {} date -d {} +%s | xargs -I {} bash -c 'echo $(( ({} - $(date +%s)) / 86400 )) days remaining'

# Check the certificate file directly
openssl x509 -in docker/nginx/ssl/fullchain.pem -noout -dates 2>/dev/null || echo "Certificate file not found"

# Check all certificate details
openssl x509 -in docker/nginx/ssl/fullchain.pem -noout -text 2>/dev/null | grep -E 'Not Before|Not After|Subject:|Issuer:'
```

## Impact Assessment

- **User Impact:** Users cannot access the platform. Browsers block access entirely when the certificate is expired.
- **API Impact:** API clients with strict TLS validation will refuse to connect. Webhook callbacks to external systems will fail.
- **Data Impact:** None directly. Data at rest and in the database is unaffected.
- **Compliance:** UK GDPR requires encryption in transit for personal data. An expired certificate means TLS is broken.

## Immediate Actions

### Step 1: Determine Certificate Status

```bash
# Check if the certificate is already expired or just about to expire
echo | openssl s_client -servername staffora.co.uk -connect localhost:443 2>/dev/null | openssl x509 -noout -checkend 0
# Returns: "Certificate will expire" if already expired
# Returns: "Certificate will not expire" if still valid
```

### Step 2: Renew the Certificate

#### If Using Let's Encrypt (certbot)

```bash
# Attempt automatic renewal
certbot renew --nginx

# If automatic renewal fails, force renewal
certbot certonly --nginx -d staffora.co.uk -d www.staffora.co.uk --force-renewal

# Copy renewed certificates to the Docker nginx volume
cp /etc/letsencrypt/live/staffora.co.uk/fullchain.pem docker/nginx/ssl/fullchain.pem
cp /etc/letsencrypt/live/staffora.co.uk/privkey.pem docker/nginx/ssl/privkey.pem
```

#### If Using a Commercial CA

1. Generate a new CSR if needed:

```bash
openssl req -new -key docker/nginx/ssl/privkey.pem -out /tmp/staffora.csr \
  -subj "/C=GB/ST=England/O=Staffora Ltd/CN=staffora.co.uk"
```

2. Submit the CSR to the CA and download the renewed certificate.
3. Replace the certificate files:

```bash
cp /path/to/new/fullchain.pem docker/nginx/ssl/fullchain.pem
cp /path/to/new/privkey.pem docker/nginx/ssl/privkey.pem
```

### Step 3: Reload nginx

```bash
# Reload nginx configuration (zero-downtime, no restart needed)
docker exec staffora-nginx nginx -s reload

# Verify the new certificate is being served
echo | openssl s_client -servername staffora.co.uk -connect localhost:443 2>/dev/null | openssl x509 -noout -dates
```

### Step 4: Verify HTTPS Works

```bash
# Test from the command line
curl -v https://staffora.co.uk/health 2>&1 | grep -E 'SSL|expire|subject'

# Test the API endpoint
curl -s https://staffora.co.uk/api/v1/health | jq .

# Test from an external perspective (if accessible)
echo | openssl s_client -servername staffora.co.uk -connect staffora.co.uk:443 2>/dev/null | openssl x509 -noout -dates
```

## Root Cause Investigation

### Common Causes

1. **Auto-Renewal Failed Silently**
   - Certbot cron job did not run or failed without alerting.
   - Check: `journalctl -u certbot` or `cat /var/log/letsencrypt/letsencrypt.log`.

2. **DNS Validation Failed**
   - Let's Encrypt HTTP-01 challenge could not reach the server (firewall, DNS change, or CDN).
   - Verify port 80 is reachable from the internet.

3. **Certificate Not Copied to Docker Volume**
   - Certbot renewed the cert but the Docker volume still has the old file.
   - The renewal hook script is missing or broken.

4. **Manual Certificate Not Tracked**
   - A commercial certificate was purchased once and no one set a renewal reminder.

## Resolution Steps

### Set Up Automatic Renewal (Let's Encrypt)

```bash
# Add a certbot renewal hook that copies certs and reloads nginx
cat > /etc/letsencrypt/renewal-hooks/deploy/staffora.sh << 'HOOK'
#!/bin/bash
cp /etc/letsencrypt/live/staffora.co.uk/fullchain.pem /path/to/docker/nginx/ssl/fullchain.pem
cp /etc/letsencrypt/live/staffora.co.uk/privkey.pem /path/to/docker/nginx/ssl/privkey.pem
docker exec staffora-nginx nginx -s reload
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/staffora.sh

# Verify the cron job exists
crontab -l | grep certbot
# Should show something like:
# 0 3 * * * certbot renew --quiet

# Test the renewal process (dry run)
certbot renew --dry-run
```

### Set Up Expiry Monitoring

```bash
# Add a simple check script that alerts when expiry is within 14 days
cat > /usr/local/bin/check-ssl-expiry.sh << 'CHECK'
#!/bin/bash
CERT_FILE="/path/to/docker/nginx/ssl/fullchain.pem"
WARN_DAYS=14

EXPIRY=$(openssl x509 -in "$CERT_FILE" -noout -enddate | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s)
NOW_EPOCH=$(date +%s)
DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

if [ "$DAYS_LEFT" -lt "$WARN_DAYS" ]; then
  echo "WARNING: SSL certificate expires in $DAYS_LEFT days ($EXPIRY)"
  # Send alert via email, Slack, etc.
  exit 1
fi

echo "OK: SSL certificate expires in $DAYS_LEFT days"
CHECK
chmod +x /usr/local/bin/check-ssl-expiry.sh

# Add to cron (daily check)
# 0 9 * * * /usr/local/bin/check-ssl-expiry.sh
```

## Post-Incident

- [ ] HTTPS is functional and serving the new certificate.
- [ ] Certificate expiry date is at least 60 days in the future.
- [ ] Auto-renewal is configured and tested with a dry run.
- [ ] Monitoring alert set for expiry within 14 days.
- [ ] All downstream services that connect over HTTPS are working.

## Prevention

- Use Let's Encrypt with automatic renewal (certbot) for zero-cost, automated TLS.
- Configure a deployment hook that reloads nginx after certificate renewal.
- Monitor certificate expiry with Prometheus (`ssl_certificate_expiry_seconds` metric) or a daily cron check.
- Alert at 30, 14, 7, and 1 day before expiry.
- Keep a calendar reminder for commercial certificates that require manual renewal.
- Test the full renewal flow (including Docker volume copy and nginx reload) at least once per quarter.
