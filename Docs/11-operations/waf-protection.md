# WAF Protection (ModSecurity + Nginx)

> **Implementation Status:** PLANNED — This document describes the target WAF configuration with ModSecurity. The current nginx configuration uses standard nginx:alpine without WAF integration.

*Last updated: 2026-03-21*
*Document owner: Platform Engineering / Security*
*Review cadence: Monthly (rule updates), Quarterly (full review)*

---

## 1. Overview

Staffora uses ModSecurity v3 as a Web Application Firewall (WAF) integrated with the existing nginx reverse proxy. ModSecurity inspects all HTTP traffic before it reaches the API or web frontend, blocking common attack patterns including SQL injection, XSS, path traversal, and bot abuse.

### Defence in Depth

The WAF is one layer in Staffora's security stack:

| Layer | Technology | What It Blocks |
|-------|------------|----------------|
| **WAF** (this document) | ModSecurity + OWASP CRS | SQL injection, XSS, path traversal, bot abuse, request smuggling |
| **Application** | Elysia.js + TypeBox validation | Invalid request schemas, business logic violations |
| **Auth** | BetterAuth + RBAC | Unauthenticated access, privilege escalation |
| **Database** | PostgreSQL RLS | Cross-tenant data access |
| **Rate Limiting** | Redis-backed (application) + nginx `limit_req` | Brute force, DDoS |

### Architecture

```
Client Request
       │
       ▼
┌──────────────┐
│    Nginx     │
│  (port 443)  │
│              │
│  ┌────────┐  │      ┌──────────┐
│  │ModSec  │──┼─────>│ WAF Logs │
│  │  v3    │  │      └──────────┘
│  └───┬────┘  │
│      │       │
│  Pass/Block  │
│      │       │
│  ┌───▼────┐  │
│  │upstream │  │
│  │routing  │  │
│  └───┬────┘  │
└──────┼───────┘
       │
       ▼
  API / Web
```

---

## 2. Installation

### Build Nginx with ModSecurity

Replace the standard `nginx:alpine` image with one that includes ModSecurity v3. Use the official OWASP ModSecurity image or build a custom one.

#### Option A: Use OWASP Nginx ModSecurity Docker Image

```dockerfile
# docker/nginx/Dockerfile.waf
FROM owasp/modsecurity-crs:4-nginx-alpine-202403

# Copy Staffora nginx configuration
COPY nginx/nginx-waf.conf /etc/nginx/nginx.conf
COPY nginx/ssl/ /etc/nginx/ssl/

# Copy custom WAF rules
COPY nginx/modsecurity/ /etc/modsecurity.d/custom-rules/
```

#### Option B: Build from Source

```dockerfile
# docker/nginx/Dockerfile.waf
FROM nginx:alpine AS builder

RUN apk add --no-cache \
    build-base pcre-dev zlib-dev openssl-dev \
    git automake autoconf libtool linux-headers \
    curl-dev yajl-dev geoip-dev libxml2-dev

# Build libmodsecurity
RUN git clone --depth 1 -b v3/master https://github.com/owasp-modsecurity/ModSecurity.git /tmp/modsecurity && \
    cd /tmp/modsecurity && \
    git submodule init && git submodule update && \
    ./build.sh && ./configure && \
    make -j$(nproc) && make install

# Build nginx ModSecurity connector
RUN git clone --depth 1 https://github.com/owasp-modsecurity/ModSecurity-nginx.git /tmp/modsecurity-nginx && \
    NGINX_VERSION=$(nginx -v 2>&1 | cut -d/ -f2) && \
    wget http://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz && \
    tar xzf nginx-${NGINX_VERSION}.tar.gz && \
    cd nginx-${NGINX_VERSION} && \
    ./configure --with-compat --add-dynamic-module=/tmp/modsecurity-nginx && \
    make modules && \
    cp objs/ngx_http_modsecurity_module.so /usr/lib/nginx/modules/

FROM nginx:alpine
COPY --from=builder /usr/local/modsecurity/ /usr/local/modsecurity/
COPY --from=builder /usr/lib/nginx/modules/ngx_http_modsecurity_module.so /usr/lib/nginx/modules/

# Install runtime dependencies
RUN apk add --no-cache pcre yajl libxml2 curl geoip

# Copy configurations
COPY nginx/nginx-waf.conf /etc/nginx/nginx.conf
COPY nginx/modsecurity/ /etc/modsecurity.d/
COPY nginx/ssl/ /etc/nginx/ssl/
```

### Update Docker Compose

Add the WAF-enabled nginx to `docker-compose.yml`:

```yaml
services:
  nginx:
    build:
      context: .
      dockerfile: docker/nginx/Dockerfile.waf
    container_name: staffora-nginx
    restart: unless-stopped
    profiles:
      - production
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx-waf.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - ./nginx/modsecurity:/etc/modsecurity.d/custom-rules:ro
      - waf_logs:/var/log/modsecurity
    depends_on:
      - api
      - web
    networks:
      - staffora-network
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"

volumes:
  waf_logs:
    driver: local
```

---

## 3. OWASP Core Rule Set (CRS)

The OWASP Core Rule Set provides broad protection against common web attacks. Staffora uses CRS v4.

### Configuration: `modsecurity/modsecurity.conf`

```
# =============================================================================
# ModSecurity Configuration for Staffora
# =============================================================================

# Enable ModSecurity
SecRuleEngine On

# Request body handling
SecRequestBodyAccess On
SecRequestBodyLimit 52428800        # 50MB (matches nginx client_max_body_size)
SecRequestBodyNoFilesLimit 1048576  # 1MB for non-file request bodies
SecRequestBodyLimitAction Reject

# Response body inspection (disabled for performance — API responses are trusted)
SecResponseBodyAccess Off

# Temporary files
SecTmpDir /tmp/modsecurity/tmp
SecDataDir /tmp/modsecurity/data

# Audit logging
SecAuditEngine RelevantOnly
SecAuditLogRelevantStatus "^(?:5|4(?!04))"
SecAuditLogParts ABIJDEFHZ
SecAuditLogType Serial
SecAuditLog /var/log/modsecurity/audit.log

# Debug log (reduce in production)
SecDebugLog /var/log/modsecurity/debug.log
SecDebugLogLevel 0   # 0=none, 1-9=increasing verbosity

# Default action: deny with 403 and log
SecDefaultAction "phase:1,log,auditlog,deny,status:403"
SecDefaultAction "phase:2,log,auditlog,deny,status:403"

# Unicode mapping
SecUnicodeMapFile /etc/modsecurity.d/unicode.mapping 20127

# Paranoia level: 1 (standard), 2 (enhanced), 3 (strict), 4 (maximum)
# Level 1 is recommended for production. Increase after tuning false positives.
SecAction "id:900000,phase:1,nolog,pass,t:none,setvar:tx.paranoia_level=1"

# Anomaly scoring thresholds
# Requests that accumulate more than this score are blocked.
SecAction "id:900110,phase:1,nolog,pass,t:none,\
  setvar:tx.inbound_anomaly_score_threshold=5,\
  setvar:tx.outbound_anomaly_score_threshold=4"

# Allowed HTTP methods
SecAction "id:900200,phase:1,nolog,pass,t:none,\
  setvar:'tx.allowed_methods=GET HEAD POST PUT PATCH DELETE OPTIONS'"

# Allowed request content types
SecAction "id:900220,phase:1,nolog,pass,t:none,\
  setvar:'tx.allowed_request_content_type=|application/x-www-form-urlencoded| |multipart/form-data| |text/xml| |application/xml| |application/json| |application/octet-stream|'"

# File upload extensions to block
SecAction "id:900240,phase:1,nolog,pass,t:none,\
  setvar:'tx.restricted_extensions=.asa/ .asax/ .ascx/ .axd/ .backup/ .bak/ .bat/ .cdx/ .cer/ .cfg/ .cmd/ .com/ .config/ .conf/ .cs/ .csproj/ .csr/ .dat/ .db/ .dbf/ .dll/ .dos/ .htr/ .htw/ .ida/ .idc/ .idq/ .inc/ .ini/ .key/ .licx/ .lnk/ .log/ .mdb/ .old/ .pass/ .pdb/ .pol/ .printer/ .pwd/ .rdb/ .resources/ .resx/ .sql/ .sys/ .vb/ .vbs/ .vbproj/ .vsdisco/ .webinfo/ .xsd/ .xsx/'"

# Include OWASP CRS rules
Include /etc/modsecurity.d/owasp-crs/crs-setup.conf
Include /etc/modsecurity.d/owasp-crs/rules/*.conf

# Include Staffora custom rules (loaded after CRS)
Include /etc/modsecurity.d/custom-rules/*.conf
```

---

## 4. Custom Rules for Staffora API Patterns

### `modsecurity/custom-rules/staffora-api.conf`

```
# =============================================================================
# Staffora-Specific WAF Rules
# =============================================================================
# Rule IDs: 100000-100999 (reserved for Staffora)
# =============================================================================

# ---- Rule 100001: Block requests without required API headers ----
# All API requests must include Accept: application/json
SecRule REQUEST_URI "@beginsWith /api/" \
  "id:100001,\
   phase:1,\
   t:none,\
   deny,\
   status:400,\
   log,\
   msg:'API request missing Accept header',\
   tag:'staffora/api-validation',\
   chain"
  SecRule &REQUEST_HEADERS:Accept "@eq 0" ""

# ---- Rule 100002: Enforce Idempotency-Key on mutating requests ----
# POST/PUT/PATCH/DELETE to /api/ must include Idempotency-Key header
SecRule REQUEST_URI "@beginsWith /api/" \
  "id:100002,\
   phase:1,\
   t:none,\
   deny,\
   status:400,\
   log,\
   msg:'Mutating API request missing Idempotency-Key header',\
   tag:'staffora/idempotency',\
   chain"
  SecRule REQUEST_METHOD "@rx ^(POST|PUT|PATCH|DELETE)$" \
    "chain"
    SecRule &REQUEST_HEADERS:Idempotency-Key "@eq 0" ""

# ---- Rule 100003: Block SQL injection in query parameters ----
# Extra protection for common HR search endpoints
SecRule ARGS "@detectSQLi" \
  "id:100003,\
   phase:2,\
   t:none,t:urlDecodeUni,\
   deny,\
   status:403,\
   log,\
   msg:'SQL injection detected in query parameters',\
   tag:'staffora/sqli'"

# ---- Rule 100004: Block path traversal in document download endpoints ----
SecRule REQUEST_URI "@rx /api/v1/documents/.*/download" \
  "id:100004,\
   phase:1,\
   t:none,t:urlDecodeUni,\
   deny,\
   status:403,\
   log,\
   msg:'Path traversal attempt in document download',\
   tag:'staffora/path-traversal',\
   chain"
  SecRule REQUEST_URI "@contains .." ""

# ---- Rule 100005: Rate-limit authentication endpoints (WAF layer) ----
# Additional rate limiting on top of nginx limit_req and application rate limiting
SecRule REQUEST_URI "@rx ^/api/(v1/auth|auth)/" \
  "id:100005,\
   phase:1,\
   t:none,\
   pass,\
   nolog,\
   setvar:'ip.auth_request_count=+1',\
   expirevar:'ip.auth_request_count=60'"

SecRule IP:auth_request_count "@gt 30" \
  "id:100006,\
   phase:1,\
   t:none,\
   deny,\
   status:429,\
   log,\
   msg:'Auth endpoint rate limit exceeded (WAF layer)',\
   tag:'staffora/rate-limit'"

# ---- Exclusions: known false positives ----

# Exclude JSON body from CRS rule 942100 (SQL injection in body)
# for bulk import endpoints that contain SQL-like keywords in HR data
SecRule REQUEST_URI "@rx ^/api/v1/(hr/employees/import|analytics/)" \
  "id:100900,\
   phase:1,\
   t:none,\
   pass,\
   nolog,\
   ctl:ruleRemoveTargetById=942100;ARGS"

# Exclude rich text fields from XSS rules
# Case notes and LMS content may contain HTML
SecRule REQUEST_URI "@rx ^/api/v1/(cases|lms)/" \
  "id:100901,\
   phase:2,\
   t:none,\
   pass,\
   nolog,\
   ctl:ruleRemoveTargetById=941100;ARGS:content,\
   ctl:ruleRemoveTargetById=941110;ARGS:content,\
   ctl:ruleRemoveTargetById=941160;ARGS:content"
```

---

## 5. Rate Limiting at WAF Layer

ModSecurity provides an additional rate limiting layer on top of nginx's `limit_req` and the application's Redis-backed rate limiter.

### Rate Limit Zones

| Zone | Limit | Scope | Layer |
|------|-------|-------|-------|
| General API | 100 req/s per IP | `limit_req zone=api_limit` | nginx |
| Auth endpoints | 10 req/s per IP | `limit_req zone=auth_limit` | nginx |
| Auth WAF limit | 30 req/60s per IP | ModSecurity Rule 100005-100006 | WAF |
| Application rate limit | 100 req/60s per user | Redis-backed per `(tenant, user)` | Application |

The WAF rate limit catches abuse that bypasses nginx rate limiting (e.g., distributed attacks from many IPs behind a single proxy where `X-Forwarded-For` is trusted).

---

## 6. Geo-Blocking (UK/EU Only)

Staffora is a UK HRIS platform. Block requests from outside the UK and EU to reduce the attack surface and meet GDPR data residency requirements.

### Using GeoIP2 with Nginx

```nginx
# In nginx-waf.conf — requires ngx_http_geoip2_module

load_module modules/ngx_http_geoip2_module.so;

http {
    # GeoIP2 database (MaxMind GeoLite2 — free, requires registration)
    geoip2 /usr/share/GeoIP/GeoLite2-Country.mmdb {
        auto_reload 24h;
        $geoip2_data_country_iso_code default=XX country iso_code;
    }

    # Map allowed countries
    map $geoip2_data_country_iso_code $allowed_country {
        default        0;
        # United Kingdom
        GB             1;
        # EU member states
        AT 1; BE 1; BG 1; HR 1; CY 1; CZ 1; DK 1; EE 1; FI 1;
        FR 1; DE 1; GR 1; HU 1; IE 1; IT 1; LV 1; LT 1; LU 1;
        MT 1; NL 1; PL 1; PT 1; RO 1; SK 1; SI 1; ES 1; SE 1;
        # EEA
        IS 1; LI 1; NO 1;
        # Unknown (local/internal traffic)
        XX             1;
    }

    server {
        # ... existing server block ...

        # Block non-UK/EU traffic
        if ($allowed_country = 0) {
            return 403;
        }

        # Allow health checks from anywhere (for external monitoring)
        location /health {
            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
        }
    }
}
```

### GeoIP Database Updates

The MaxMind GeoLite2 database requires periodic updates:

```bash
# Install geoipupdate tool
apt-get install geoipupdate

# Configure /etc/GeoIP.conf with your MaxMind license key
# Run weekly via cron:
0 3 * * 3 /usr/bin/geoipupdate -d /usr/share/GeoIP/
```

---

## 7. Bot Detection

### User-Agent Filtering

```
# modsecurity/custom-rules/bot-detection.conf

# ---- Block known bad bots ----
SecRule REQUEST_HEADERS:User-Agent "@pmFromFile /etc/modsecurity.d/bad-bots.txt" \
  "id:100100,\
   phase:1,\
   t:none,t:lowercase,\
   deny,\
   status:403,\
   log,\
   msg:'Known bad bot blocked',\
   tag:'staffora/bot-detection'"

# ---- Block empty User-Agent (except health checks) ----
SecRule REQUEST_URI "!@beginsWith /health" \
  "id:100101,\
   phase:1,\
   t:none,\
   deny,\
   status:403,\
   log,\
   msg:'Empty User-Agent blocked',\
   tag:'staffora/bot-detection',\
   chain"
  SecRule &REQUEST_HEADERS:User-Agent "@eq 0" ""

# ---- Block requests with suspicious header combinations ----
# Legitimate browsers always send Accept, Accept-Language, Accept-Encoding
SecRule REQUEST_URI "@beginsWith /api/" \
  "id:100102,\
   phase:1,\
   t:none,\
   pass,\
   nolog,\
   setvar:'tx.header_score=0'"

SecRule &REQUEST_HEADERS:Accept-Encoding "@eq 0" \
  "id:100103,\
   phase:1,\
   t:none,\
   pass,\
   nolog,\
   setvar:'tx.header_score=+1'"

SecRule TX:header_score "@ge 3" \
  "id:100104,\
   phase:1,\
   t:none,\
   deny,\
   status:403,\
   log,\
   msg:'Suspicious request headers (bot fingerprint)',\
   tag:'staffora/bot-detection'"
```

### `bad-bots.txt`

```
# Known malicious bots and scanners
sqlmap
nikto
dirbuster
gobuster
masscan
nmap
wpscan
acunetix
nessus
openvas
burpsuite
zap
nuclei
httpie
python-requests
go-http-client
```

---

## 8. WAF Log Integration with Centralised Logging

### Log Format

ModSecurity writes audit logs to `/var/log/modsecurity/audit.log`. Integrate with the existing Loki/Promtail stack.

### Promtail Configuration Addition

Add to `docker/promtail/config.yml`:

```yaml
scrape_configs:
  # ... existing configs ...

  - job_name: modsecurity
    static_configs:
      - targets:
          - localhost
        labels:
          job: modsecurity
          __path__: /var/log/modsecurity/audit.log

    pipeline_stages:
      - multiline:
          firstline: '---[a-zA-Z0-9]+'
          max_wait_time: 3s
      - regex:
          expression: 'id "(?P<rule_id>\d+)".*msg "(?P<message>[^"]*)".*severity "(?P<severity>[^"]*)"'
      - labels:
          rule_id:
          severity:
```

### Grafana Dashboard Queries

**WAF Blocks per Hour**:
```logql
sum(rate({job="modsecurity"} |= "Access denied" [1h]))
```

**Top Blocked Rules**:
```logql
topk(10, sum by (rule_id) (rate({job="modsecurity"} | regexp `id "(?P<rule_id>\d+)"` [1h])))
```

**Blocked IPs**:
```logql
topk(10, sum by (remote_addr) (rate({job="modsecurity"} |= "Access denied" [1h])))
```

---

## 9. Nginx WAF Configuration

### `nginx/nginx-waf.conf`

This is the full nginx configuration with ModSecurity enabled. It extends the existing `docker/nginx/nginx.conf`:

```nginx
# Load ModSecurity module
load_module modules/ngx_http_modsecurity_module.so;

worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 2048;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'rt=$request_time uct="$upstream_connect_time" '
                    'uht="$upstream_header_time" urt="$upstream_response_time" '
                    'upstream="$upstream_addr"';

    access_log /var/log/nginx/access.log main;

    # Performance
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript
               application/xml application/xml+rss text/javascript;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;
    limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/s;
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

    # DNS resolver
    resolver 127.0.0.11 valid=10s ipv6=off;

    # Upstreams
    upstream api_backend {
        least_conn;
        server api:3000;
        keepalive 64;
        keepalive_timeout 60s;
    }

    upstream web_backend {
        server web:5173;
        keepalive 16;
    }

    # ---- ModSecurity ----
    modsecurity on;
    modsecurity_rules_file /etc/modsecurity.d/modsecurity.conf;

    # HTTP -> HTTPS redirect
    server {
        listen 80;
        server_name _;

        location /health {
            modsecurity off;   # Skip WAF for health checks
            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
        }

        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS server with WAF
    server {
        listen 443 ssl http2;
        server_name _;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_session_timeout 1d;
        ssl_session_cache shared:SSL:50m;
        ssl_session_tickets off;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
        ssl_prefer_server_ciphers off;

        add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

        limit_conn conn_limit 50;
        client_max_body_size 50M;

        # API routes (WAF enabled)
        location /api/ {
            limit_req zone=api_limit burst=50 nodelay;

            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Connection "";

            proxy_next_upstream error timeout http_502 http_503;
            proxy_next_upstream_tries 3;
            proxy_next_upstream_timeout 10s;

            proxy_connect_timeout 30s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
            proxy_buffering off;
        }

        # Auth endpoints (stricter rate limiting, WAF enabled)
        location /api/v1/auth/ {
            limit_req zone=auth_limit burst=5 nodelay;

            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Connection "";

            proxy_next_upstream error timeout;
            proxy_next_upstream_tries 2;
        }

        # Health check (WAF disabled for monitoring tools)
        location /health {
            modsecurity off;
            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
        }

        # Ready/Live checks (WAF disabled)
        location ~ ^/(ready|live)$ {
            modsecurity off;
            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Connection "";
        }

        # Frontend (WAF enabled for XSS protection)
        location / {
            proxy_pass http://web_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Connection "";

            location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
                modsecurity off;   # Skip WAF for static assets
                proxy_pass http://web_backend;
                proxy_cache_valid 200 1d;
                add_header Cache-Control "public, max-age=86400";
            }
        }

        error_page 500 502 503 504 /50x.html;
        location = /50x.html {
            root /usr/share/nginx/html;
            internal;
        }
    }
}
```

---

## 10. Testing the WAF

### Manual Testing

```bash
# Test SQL injection blocking
curl -k "https://app.staffora.co.uk/api/v1/hr/employees?search=1'%20OR%201=1--"
# Expected: 403 Forbidden

# Test XSS blocking
curl -k "https://app.staffora.co.uk/api/v1/cases" \
  -H "Content-Type: application/json" \
  -d '{"title":"<script>alert(1)</script>"}'
# Expected: 403 Forbidden

# Test path traversal blocking
curl -k "https://app.staffora.co.uk/api/v1/documents/../../../etc/passwd/download"
# Expected: 403 Forbidden

# Test normal request passes through
curl -k "https://app.staffora.co.uk/health"
# Expected: 200 OK

# Test geo-blocking (from a non-UK/EU VPN)
# Expected: 403 Forbidden
```

### Automated WAF Testing

Use OWASP ZAP or Nikto in CI to verify the WAF blocks common attacks. Add to the security workflow:

```yaml
# In .github/workflows/security.yml
- name: WAF rule validation
  run: |
    # Start services with WAF enabled
    docker compose -f docker/docker-compose.yml --profile production up -d

    # Wait for nginx + WAF to be ready
    timeout 60 bash -c 'until curl -sf http://localhost/health; do sleep 2; done'

    # Test SQL injection is blocked
    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "http://localhost/api/v1/hr/employees?q=1'+OR+1=1--")
    [ "$HTTP_CODE" = "403" ] || (echo "FAIL: SQLi not blocked (got $HTTP_CODE)" && exit 1)

    echo "WAF rules validated."
```

---

## 11. Operational Procedures

### Viewing WAF Logs

```bash
# Real-time WAF blocks
docker exec staffora-nginx tail -f /var/log/modsecurity/audit.log

# Via Grafana (Loki)
# Navigate to Explore > Loki > {job="modsecurity"} |= "Access denied"
```

### Tuning False Positives

1. Identify the blocked rule ID from the audit log
2. Determine if the request is legitimate
3. Add a rule exclusion in `modsecurity/custom-rules/staffora-api.conf`:

```
# Example: Exclude rule 942100 for bulk import endpoint
SecRule REQUEST_URI "@beginsWith /api/v1/hr/employees/import" \
  "id:100910,phase:1,t:none,pass,nolog,ctl:ruleRemoveById=942100"
```

4. Test the exclusion
5. Reload nginx: `nginx -t && nginx -s reload`

### Emergency WAF Bypass

If the WAF is blocking legitimate traffic and cannot be tuned immediately:

```bash
# Switch to detection-only mode (logs but does not block)
# In modsecurity.conf, change:
#   SecRuleEngine On
# to:
#   SecRuleEngine DetectionOnly

# Then reload nginx
docker exec staffora-nginx nginx -s reload

# IMPORTANT: File an incident to investigate and fix the root cause
```

---

## Related Documentation

- [docker/nginx/nginx.conf](../../docker/nginx/nginx.conf) -- Base nginx configuration
- [Docs/security/README.md](../security/README.md) -- Security architecture overview
- [Docs/patterns/SECURITY.md](../patterns/SECURITY.md) -- Security patterns (RLS, auth, RBAC)
- [Docs/operations/log-aggregation.md](log-aggregation.md) -- Loki/Promtail log aggregation
- [Docs/operations/auto-scaling.md](auto-scaling.md) -- Scaling configuration
