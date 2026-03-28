# CDN and Static Asset Caching

*Last updated: 2026-03-28*

This document describes the caching strategy for Staffora's frontend static assets, how nginx acts as a caching reverse proxy, and how to layer an external CDN (Cloudflare, CloudFront) in front for global edge delivery.

## Architecture Overview

```
                        +------------------+
                        |   External CDN   |
                        | (Cloudflare /    |
                        |  CloudFront)     |
                        +--------+---------+
                                 |
                        +--------+---------+
                        |    Nginx         |
                        | (reverse proxy + |
                        |  cache layer)    |
                        +---+----------+---+
                            |          |
              +-------------+    +-----+----------+
              | API Backend |    | Web SSR Server  |
              | (Elysia.js) |    | (React Router)  |
              +-------------+    +----------------+
```

In the current self-hosted Docker deployment, nginx serves as both a TLS-terminating reverse proxy and a caching layer. The React Router v7 web application uses server-side rendering (SSR), so HTML pages are generated per-request. Static assets (JS, CSS, fonts, images) are served through the SSR server and cached by nginx.

## Caching Strategy

### Hashed Static Assets (`/assets/*`)

Vite (via React Router v7) produces content-hashed filenames for all JS, CSS, and imported assets. For example:

```
/assets/index-B3k9f2Lq.js
/assets/index-a1F8kR2m.css
/assets/logo-7xPqR3nw.png
```

Because the filename changes whenever the content changes, these files are **immutable** -- a given URL always returns the same bytes. The cache policy is:

```
Cache-Control: public, max-age=31536000, immutable
```

- `public`: Shared caches (CDN, nginx proxy cache) may store this response.
- `max-age=31536000`: Cache for 1 year (365 days).
- `immutable`: Tells browsers to skip revalidation entirely. No conditional requests (If-None-Match) are sent within the max-age window. This eliminates unnecessary round-trips on page reload.

**Nginx proxy cache**: These responses are also cached in nginx's `static_cache_zone` (up to 1 GB on disk, 7-day inactive eviction). This reduces load on the web SSR server for repeated asset requests.

### HTML Responses (`/`)

HTML pages are server-rendered and may contain:
- CSRF tokens embedded for form submission
- User-specific meta tags (e.g., for SSR-rendered dashboards)
- References to the latest hashed asset filenames

The cache policy is:

```
Cache-Control: no-cache
```

- `no-cache` means the browser must revalidate with the origin before using a cached copy. It does NOT mean "do not cache" -- the browser can still cache the response and use conditional requests (304 Not Modified) if the server supports ETag/Last-Modified.
- HTML responses are **not** stored in the nginx proxy cache.

### Non-Hashed Static Files

Files like `favicon.ico`, `robots.txt`, and `manifest.webmanifest` do not have content hashes in their filenames. These use a shorter cache lifetime with mandatory revalidation:

```
Cache-Control: public, max-age=86400, must-revalidate
```

This provides 24-hour caching while ensuring updates propagate within a day.

### API Responses

API responses are cached in the `api_cache_zone` with a 60-second TTL, **only for unauthenticated requests**. Authenticated requests (those with a session cookie or Authorization header) always bypass the cache. This prevents cross-user data leakage.

Auth endpoints (`/api/v1/auth/*`, `/api/auth/*`) are explicitly excluded from caching with `no-store, no-cache, must-revalidate`.

## Configuration Files

| File | Purpose |
|------|---------|
| `docker/nginx/nginx.conf` | Main nginx configuration with location blocks and cache headers |
| `docker/nginx/cache.conf` | Proxy cache zones, cache key definitions, and bypass rules |
| `docker/docker-compose.yml` | Mounts both config files and the `nginx_cache` volume |

### Cache Zones

| Zone | Memory | Max Disk | Inactive Eviction | Purpose |
|------|--------|----------|-------------------|---------|
| `api_cache_zone` | 10 MB | 256 MB | 10 minutes | Short-lived API response cache |
| `static_cache_zone` | 10 MB | 1 GB | 7 days | Long-lived static asset cache |

## Compression

### Gzip

Enabled by default in `nginx.conf` for all text-based content types:

- `text/plain`, `text/css`, `text/xml`, `text/javascript`
- `application/json`, `application/javascript`, `application/xml`
- `image/svg+xml`, `font/opentype`, `font/woff2`

Minimum response size: 1024 bytes. Compression level: 6 (balanced CPU vs ratio).

### Brotli

Brotli offers 15-20% better compression ratios than gzip for text assets. Two approaches are supported:

**Option 1: Runtime compression** (requires custom nginx image with ngx_brotli module)

Uncomment the `brotli` directives in `nginx.conf`. Use `fholzer/nginx-brotli:latest` or build a custom image.

**Option 2: Pre-compressed files** (recommended for production)

Generate `.br` files at build time using `vite-plugin-compression`:

```bash
bun add -D vite-plugin-compression
```

```ts
// packages/web/vite.config.ts
import compression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    // ... existing plugins
    compression({ algorithm: 'brotliCompress', ext: '.br' }),
    compression({ algorithm: 'gzip', ext: '.gz' }),
  ],
});
```

Then enable `gzip_static on;` and `brotli_static on;` in nginx. Nginx will serve pre-compressed files when the client includes `Accept-Encoding: br` or `Accept-Encoding: gzip`.

## Adding an External CDN

For global edge delivery, place a CDN in front of nginx. This is recommended for production deployments with users across multiple regions.

### Cloudflare (Recommended for UK-focused deployment)

Cloudflare operates over 20 data centres in the UK and Ireland, providing excellent latency for a UK HRIS platform.

**UK Points of Presence (PoPs):**
- London (LHR) -- primary, multiple facilities
- Manchester (MAN)
- Edinburgh (EDI)
- Dublin (DUB) -- for Irish operations

**Setup steps:**

1. **DNS**: Point the `staffora.co.uk` domain to Cloudflare (orange-cloud proxy mode).

2. **SSL mode**: Set to "Full (Strict)" so Cloudflare validates the origin certificate.

3. **Cache Rules**: Create a Page Rule or Cache Rule:
   - `/assets/*` -- Cache Level: Cache Everything, Edge TTL: 1 month
   - `/*` -- Cache Level: Standard (respects origin Cache-Control headers)

4. **Origin Cache-Control**: Cloudflare respects origin `Cache-Control` headers by default. The headers set by nginx (immutable for assets, no-cache for HTML) work correctly out of the box.

5. **Bypass cookies**: Ensure Cloudflare does not cache responses that include `Set-Cookie` headers. This is the default behaviour in Standard cache mode.

6. **Compression**: Cloudflare applies Brotli automatically to all proxied traffic. Disable the nginx-level Brotli to avoid double-compression.

**Cloudflare-specific settings:**
```
Browser Cache TTL: Respect Existing Headers
Always Online: Off (SSR pages are personalised)
Auto Minify: Off (Vite already minifies)
Rocket Loader: Off (conflicts with React hydration)
```

### AWS CloudFront

For deployments already on AWS infrastructure.

**UK-relevant edge locations:**
- London (LHR) -- 3 edge locations
- Manchester (MAN)
- Dublin (DUB)

**Setup steps:**

1. **Distribution**: Create a CloudFront distribution with the nginx origin (e.g., `origin.staffora.co.uk`).

2. **Behaviours**:
   - Path `/assets/*`: Cache based on origin headers, TTL override to max 31536000, compress objects automatically.
   - Path `/*` (default): Cache based on origin headers, forward all headers, forward cookies.

3. **Origin Protocol Policy**: HTTPS Only.

4. **Cache Policy**: Create a custom policy:
   - Include `Accept-Encoding` in the cache key (gzip and Brotli variants are cached separately).
   - Do NOT include `Authorization` or `Cookie` headers in the cache key for `/assets/*`.
   - Forward all headers for `/*` (HTML is not cached at the edge).

5. **Origin Request Policy**: Forward `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`.

6. **SSL**: Use ACM certificate for `staffora.co.uk` in `us-east-1` (required by CloudFront).

### CDN Configuration Verification

After setting up either CDN, verify with:

```bash
# Check cache status headers
curl -sI https://staffora.co.uk/assets/index-B3k9f2Lq.js | grep -i cache
# Expected: cache-control: public, max-age=31536000, immutable
# Expected: cf-cache-status: HIT (Cloudflare) or x-cache: Hit from cloudfront

# Verify HTML is not cached
curl -sI https://staffora.co.uk/ | grep -i cache
# Expected: cache-control: no-cache

# Verify compression
curl -sI -H "Accept-Encoding: br,gzip" https://staffora.co.uk/assets/index-B3k9f2Lq.js | grep -i content-encoding
# Expected: content-encoding: br (or gzip)
```

## UK-Focused PoP Coverage Recommendations

For a UK HRIS platform, user traffic is concentrated in the UK. Recommended CDN coverage priorities:

1. **London** -- Majority of UK business traffic. Ensure the CDN has multiple PoPs here.
2. **Manchester** -- Second-largest UK business hub. Important for Northern England users.
3. **Edinburgh** -- Scottish offices and public sector clients.
4. **Dublin** -- Irish operations and UK-Ireland cross-border workers.
5. **Amsterdam / Frankfurt** -- Fallback for UK traffic during London PoP maintenance.

Both Cloudflare and CloudFront provide excellent UK coverage. Cloudflare's free tier includes UK PoPs, making it the lower-cost option for initial deployment.

**Latency targets:**
- UK users: < 20ms to nearest edge (asset serving)
- HTML (SSR): < 200ms total (edge to origin round-trip + server rendering)
- API: < 100ms for cached responses, < 500ms P95 for uncached

## Cache Purge Procedures on Deploy

When deploying a new frontend build, hashed assets do not need purging (new filenames mean new cache entries). However, HTML must be revalidated to reference the new asset hashes.

### Nginx Cache Purge

```bash
# Clear the entire nginx proxy cache (run inside the nginx container)
docker exec staffora-nginx rm -rf /var/cache/nginx/static_cache/*
docker exec staffora-nginx rm -rf /var/cache/nginx/api_cache/*

# Reload nginx to rebuild cache index
docker exec staffora-nginx nginx -s reload
```

Alternatively, if `ngx_cache_purge` module is available:
```bash
curl -X PURGE https://staffora.co.uk/assets/*
```

### Cloudflare Cache Purge

```bash
# Purge everything (use sparingly -- triggers cache rebuild for all assets)
curl -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'

# Purge specific URLs (preferred -- only invalidate what changed)
curl -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://staffora.co.uk/","https://staffora.co.uk/favicon.ico"]}'

# Purge by prefix (Enterprise only)
curl -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"prefixes":["https://staffora.co.uk/"]}'
```

### CloudFront Cache Invalidation

```bash
# Invalidate HTML and non-hashed files
aws cloudfront create-invalidation \
  --distribution-id ${DISTRIBUTION_ID} \
  --paths "/" "/favicon.ico" "/robots.txt" "/manifest.webmanifest"

# Invalidate everything (use sparingly -- first 1000 paths/month are free)
aws cloudfront create-invalidation \
  --distribution-id ${DISTRIBUTION_ID} \
  --paths "/*"
```

### Automated Purge in CI/CD

Add a post-deploy step to your pipeline:

```yaml
# GitHub Actions example
- name: Purge CDN cache
  if: success()
  run: |
    # Only purge HTML and non-hashed files — hashed assets are immutable
    curl -X POST "https://api.cloudflare.com/client/v4/zones/${{ secrets.CF_ZONE_ID }}/purge_cache" \
      -H "Authorization: Bearer ${{ secrets.CF_API_TOKEN }}" \
      -H "Content-Type: application/json" \
      --data '{"files":["https://staffora.co.uk/","https://staffora.co.uk/favicon.ico"]}'
```

**Key principle**: Never purge `/assets/*` -- the content-hashed filenames guarantee correctness. Only purge HTML and non-hashed files so browsers fetch the new HTML that references updated asset hashes.

## Performance Monitoring

### Nginx Cache Hit Ratio

The `X-Cache-Status` header is included in all responses. Monitor cache effectiveness with:

```bash
# Parse access logs for cache hit ratio
docker exec staffora-nginx awk '$0 ~ /cache="HIT"/ {hit++} $0 ~ /cache="MISS"/ {miss++} END {printf "Hit ratio: %.1f%% (%d hits, %d misses)\n", hit/(hit+miss)*100, hit, miss}' /var/log/nginx/access.log
```

Possible `X-Cache-Status` values:
- `HIT` -- Served from nginx cache
- `MISS` -- Fetched from upstream, now cached
- `EXPIRED` -- Cache entry expired, refreshed from upstream
- `BYPASS` -- Cache was intentionally bypassed (authenticated request)
- `STALE` -- Served stale content (upstream error, if stale-while-revalidate is configured)
- `-` -- Not a cacheable request

**Target hit ratios:**
- Static assets (`/assets/*`): > 95%
- API responses: 20-40% (most requests are authenticated)

### Grafana Dashboard Metrics

If the monitoring profile is enabled, add these panels to the nginx Grafana dashboard:

1. **Cache hit ratio over time**: Track `$upstream_cache_status` values from parsed access logs.
2. **Asset response time (P50/P95/P99)**: Should be < 5ms for cached assets.
3. **Bandwidth saved by cache**: Compare `$body_bytes_sent` for HIT vs MISS.
4. **Compression ratio**: Compare `Content-Length` vs `$body_bytes_sent` for gzipped responses.

### Cloudflare Analytics

If using Cloudflare, the dashboard provides:
- Cache hit ratio (target: > 90% for static assets)
- Bandwidth saved
- Response time by PoP
- Top cached/uncached URLs
- Threat mitigation stats

### Synthetic Monitoring

Add uptime checks that verify caching headers:

```bash
# Verify immutable assets return correct headers
curl -sI https://staffora.co.uk/assets/index-B3k9f2Lq.js \
  | grep -q "immutable" && echo "PASS" || echo "FAIL: missing immutable header"

# Verify HTML returns no-cache
curl -sI https://staffora.co.uk/ \
  | grep -q "no-cache" && echo "PASS" || echo "FAIL: missing no-cache header"

# Verify gzip compression is active
curl -sI -H "Accept-Encoding: gzip" https://staffora.co.uk/assets/index-B3k9f2Lq.js \
  | grep -q "content-encoding: gzip" && echo "PASS" || echo "FAIL: gzip not active"
```

## Troubleshooting

### Assets not being cached

1. Check the `X-Cache-Status` response header. If it shows `-`, the request does not match a cached location block.
2. Verify the URL path starts with `/assets/` (case-sensitive).
3. Check nginx error log: `docker logs staffora-nginx --tail 100`.
4. Verify cache directory has write permissions: `docker exec staffora-nginx ls -la /var/cache/nginx/`.

### Stale HTML after deploy

1. Verify the deploy process purged HTML from the CDN (see cache purge procedures above).
2. Check that HTML responses include `Cache-Control: no-cache` (not `max-age`).
3. Force refresh in the browser: Ctrl+Shift+R / Cmd+Shift+R.
4. If using Cloudflare, check the "Caching" tab for any page rules that override origin headers.

### High origin bandwidth despite CDN

1. Check CDN cache hit ratio. If low, verify cache rules are configured correctly.
2. Look for cache-busting query strings (e.g., `?v=timestamp`) that create unique cache keys.
3. Ensure `Vary` headers are not overly broad (e.g., `Vary: *` disables caching).
4. Check if `Set-Cookie` headers on asset responses are preventing CDN caching.

### Compression not working

1. Verify `Accept-Encoding` header is forwarded to nginx (CDNs sometimes strip it).
2. Check `gzip_min_length` -- responses below 1024 bytes are not compressed.
3. Ensure `Content-Type` matches one of the types in `gzip_types`.
4. For Brotli, verify the nginx image includes the `ngx_brotli` module.
