# Environment Variables Reference

> Complete reference for all environment variables used by the Staffora platform.
> *Last updated: 2026-03-28*

This document is derived from actual source code references in the repository. Each variable includes the default value used in code and which service(s) consume it.

**Setup:** Copy `docker/.env.example` to `docker/.env` and fill in the required values before starting the platform.

---

## Table of Contents

- [Required Variables](#required-variables)
- [PostgreSQL Database](#postgresql-database)
- [PgBouncer Connection Pooler](#pgbouncer-connection-pooler)
- [Redis Cache and Queue](#redis-cache-and-queue)
- [Authentication (Better Auth)](#authentication-better-auth)
- [API Server](#api-server)
- [Frontend (Web)](#frontend-web)
- [CORS and Security](#cors-and-security)
- [Background Workers](#background-workers)
- [File Storage](#file-storage)
- [Email (SMTP)](#email-smtp)
- [Push Notifications](#push-notifications)
- [Virus Scanning (ClamAV)](#virus-scanning-clamav)
- [Observability: OpenTelemetry](#observability-opentelemetry)
- [Observability: Sentry](#observability-sentry)
- [Observability: Logging](#observability-logging)
- [Observability: Monitoring Stack](#observability-monitoring-stack)
- [Database Backups](#database-backups)
- [WAL Archiving and PITR](#wal-archiving-and-pitr)
- [SSO (SAML/OIDC)](#sso-samloidc)
- [Bootstrap (First-Time Setup)](#bootstrap-first-time-setup)
- [TLS Certificates](#tls-certificates)
- [Feature Flags](#feature-flags)
- [Testing](#testing)

---

## Required Variables

These variables **must** be set before the platform will start correctly. They have no safe defaults.

| Variable | Description | Used By |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | PostgreSQL superuser password | Docker Compose, Migrations |
| `DATABASE_URL` | Full PostgreSQL connection URL (superuser) | API, Worker, Migrations |
| `SESSION_SECRET` | Session signing secret (32+ chars). Generate with `openssl rand -base64 32` | API (Better Auth) |
| `CSRF_SECRET` | CSRF protection secret (32+ chars). Generate with `openssl rand -base64 32` | API (auth plugin) |
| `BETTER_AUTH_SECRET` | Better Auth encryption secret (32+ chars). Generate with `openssl rand -base64 32` | API (Better Auth) |

> **Note:** In development, the auth secrets will use insecure fallback defaults with a console warning. In production (`NODE_ENV=production`), the application will refuse to start without them.

---

## PostgreSQL Database

### Connection URLs

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `DATABASE_URL` | -- (required) | PostgreSQL connection URL for the superuser (`hris`). Used for migrations and direct DB access. | API, Worker, Migrations |
| `DATABASE_APP_URL` | -- | PostgreSQL connection URL for the application role (`hris_app` with `NOBYPASSRLS`). Preferred over `DATABASE_URL` at runtime so RLS is enforced. In Docker, routed through PgBouncer. | API, Worker, Better Auth |

### Component Overrides

These are used as a fallback when `DATABASE_URL` / `DATABASE_APP_URL` are not set. `DB_PASSWORD` is required if using component overrides.

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `DB_HOST` | `localhost` | PostgreSQL host | API, Worker, Migrations |
| `DB_PORT` | `5432` | PostgreSQL port | API, Worker, Migrations |
| `DB_USER` | `hris` | PostgreSQL username | API, Worker, Migrations |
| `DB_PASSWORD` | -- (required if no URL) | PostgreSQL password | API, Worker, Migrations |
| `DB_NAME` | `hris` | PostgreSQL database name | API, Worker, Migrations |
| `DB_SSL` | `false` | Enable SSL for database connections (`true` = `sslmode=require`) | API, Worker |
| `DB_DEBUG` | `false` | Enable database query debug logging | API |
| `DB_MAX_CONNECTIONS` | `20` (direct) / `10` (PgBouncer) | Maximum pool connections | API, Worker |
| `DB_IDLE_TIMEOUT` | `20` (URL) / `30` (components) | Idle connection timeout in seconds | API |
| `DB_CONNECT_TIMEOUT` | `10` | Connection timeout in seconds | API |

### Docker Compose Variables

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `POSTGRES_USER` | `hris` | PostgreSQL superuser name | Docker Compose |
| `POSTGRES_PASSWORD` | `hris_dev_password` | PostgreSQL superuser password | Docker Compose |
| `POSTGRES_DB` | `hris` | PostgreSQL database name | Docker Compose |
| `POSTGRES_PORT` | `5432` | Host port mapping for PostgreSQL | Docker Compose |
| `POSTGRES_APP_USER` | `hris_app` | Application role username (used in Docker-generated URLs) | Docker Compose |
| `POSTGRES_APP_PASSWORD` | `hris_dev_password` | Application role password (used in Docker-generated URLs) | Docker Compose |

---

## PgBouncer Connection Pooler

PgBouncer sits between the application and PostgreSQL to multiplex connections. In Docker, `DATABASE_APP_URL` is routed through PgBouncer automatically.

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `PGBOUNCER_PORT` | `6432` | Host port for PgBouncer | Docker Compose |
| `PGBOUNCER_ENABLED` | `false` | Force PgBouncer mode (disables prepared statements) even when port is not 6432 | API, Worker |

> **Detection:** PgBouncer is auto-detected when the connection port is `6432` or `PGBOUNCER_ENABLED=true`. When detected, prepared statements are disabled for transaction-mode compatibility.

---

## Redis Cache and Queue

### Connection URL

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `REDIS_URL` | `redis://localhost:6379` | Full Redis connection URL (takes precedence over component vars) | API, Worker |

### Component Overrides

Used when `REDIS_URL` is not set.

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `REDIS_HOST` | `localhost` | Redis host | API, Worker |
| `REDIS_PORT` | `6379` | Redis port | API, Worker, Docker Compose |
| `REDIS_PASSWORD` | -- | Redis password | API, Worker, Docker Compose |
| `REDIS_DB` | `0` | Redis database number | API, Worker |

### Tuning

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `REDIS_KEY_PREFIX` | `staffora:` | Key prefix for all Redis keys | API, Worker |
| `REDIS_MAX_RETRIES` | `3` | Maximum reconnection retries | API, Worker |
| `REDIS_CONNECT_TIMEOUT` | `10000` | Connection timeout in milliseconds | API, Worker |
| `REDIS_COMMAND_TIMEOUT` | `5000` | Command timeout in milliseconds | API, Worker |
| `REDIS_RETRY_DELAY` | `500` | Retry delay in milliseconds | API, Worker |

---

## Authentication (Better Auth)

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `BETTER_AUTH_SECRET` | -- (required in production) | Encryption secret for Better Auth (32+ chars). Falls back to `SESSION_SECRET`. | API |
| `SESSION_SECRET` | -- (required in production) | Session signing secret (32+ chars). Fallback for `BETTER_AUTH_SECRET`. | API |
| `CSRF_SECRET` | -- (required in production) | CSRF token validation secret (32+ chars). Falls back to `SESSION_SECRET`, then `BETTER_AUTH_SECRET`. | API |
| `BETTER_AUTH_URL` | `http://localhost:3000` | Base URL for auth callbacks. Falls back to `API_URL`. | API |
| `BETTER_AUTH_API_KEY` | -- | API key for Better Auth Infra dashboard (from [dash.better-auth.com](https://dash.better-auth.com)) | API |
| `ENFORCE_ADMIN_MFA` | `false` | Require MFA for admin users. Automatically enabled in production. | API |

> **Secret priority:** `BETTER_AUTH_SECRET` > `SESSION_SECRET` (for auth). `CSRF_SECRET` > `SESSION_SECRET` > `BETTER_AUTH_SECRET` (for CSRF).

---

## API Server

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `PORT` | `3000` | API server listen port | API |
| `API_PORT` | `3000` | Host port mapping for the API container | Docker Compose |
| `NODE_ENV` | `development` | Environment mode (`development`, `production`, `test`). Controls cookie security, CORS strictness, email verification, error verbosity, and more. | API, Worker, Frontend |
| `API_URL` | `http://localhost:3000` | Public API URL. Fallback for `BETTER_AUTH_URL`. | API, SSO |
| `APP_URL` | `http://localhost:5173` | Frontend application URL. Used in notification emails and action links. | Worker (domain events, scheduler) |
| `MAX_BODY_SIZE` | `10485760` (10 MB) | Maximum request body size in bytes | API |
| `LOG_LEVEL` | `debug` (dev) / `info` (prod) | Log level: `debug`, `info`, `warn`, `error` | API, Worker |
| `ADMIN_IP_ALLOWLIST` | -- (all IPs allowed) | Comma-separated IPs/CIDRs allowed to access admin endpoints. Supports IPv4 and CIDR notation. | API |
| `TRUSTED_PROXIES` | -- | Comma-separated list of trusted proxy IPs for `X-Forwarded-For` parsing | API |
| `AUDIT_READ_ACCESS` | `false` | Enable audit logging for read (GET) requests | API |

### Rate Limiting

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `RATE_LIMIT_MAX` | `100` | Maximum requests per window per IP | API |
| `RATE_LIMIT_WINDOW` | `60000` | Rate limit window in milliseconds | API |

---

## Frontend (Web)

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `VITE_API_URL` | `http://localhost:3000` | API URL used by the frontend (Vite build-time variable, also available at runtime) | Frontend |
| `INTERNAL_API_URL` | `http://api:3000` | Internal Docker-network API URL for server-side rendering (SSR) data fetching. Not exposed to the browser. | Frontend (SSR) |
| `WEB_PORT` | `5173` | Host port mapping for the web frontend container | Docker Compose |

> **Note:** `VITE_API_URL` is embedded at build time by Vite. In Docker, `INTERNAL_API_URL` is used for SSR requests so they route through Docker DNS (which load-balances across API replicas).

---

## CORS and Security

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed CORS origins. Shared between Elysia CORS middleware and Better Auth trusted origins. | API |

> **Important:** In development mode, `localhost` and `127.0.0.1` on any port are also allowed automatically.

---

## Background Workers

### Worker Configuration

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `WORKER_TYPE` | `all` | Worker type to run (`all`, or specific worker names) | Worker |
| `WORKER_HEALTH_PORT` | `3001` | Health check endpoint port for the worker process | Worker |
| `WORKER_ID` | `worker-{pid}` | Unique worker identifier | Worker |
| `WORKER_GROUP` | `staffora-workers` | Redis consumer group name | Worker |
| `WORKER_CONCURRENCY` | `5` | Number of concurrent job processors | Worker |
| `WORKER_POLL_INTERVAL` | `1000` | Job polling interval in milliseconds | Worker |
| `WORKER_BLOCK_TIMEOUT` | `5000` | Redis XREADGROUP block timeout in milliseconds | Worker |
| `WORKER_MAX_RETRIES` | `10` | Maximum retry attempts for failed jobs | Worker |
| `WORKER_PROCESS_PENDING` | `true` | Process pending (unacknowledged) messages on startup. Set to `false` to skip. | Worker |
| `WORKER_CLAIM_TIMEOUT` | `60000` | Timeout in milliseconds before claiming abandoned messages | Worker |

### Outbox Processor

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `ENABLE_OUTBOX_POLLING` | `true` | Enable outbox polling. Set to `false` to disable. | Worker |
| `OUTBOX_POLL_INTERVAL` | `1000` | Outbox polling interval in milliseconds | Worker |
| `OUTBOX_BATCH_SIZE` | `100` | Number of outbox records to process per batch | Worker |

### Export Worker

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `EXPORT_STORAGE_PATH` | `/tmp/staffora-exports` | Local filesystem path for export files | Worker |
| `EXPORT_BASE_URL` | `http://localhost:3000/api/exports` | Base URL for generated export download links | Worker |
| `S3_EXPORT_BUCKET` | `staffora-exports` | S3 bucket for export files (used in production) | Worker |
| `S3_EXPORT_PREFIX` | `exports/` | S3 key prefix for export files | Worker |

### PDF Worker

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `PDF_STORAGE_PATH` | `/tmp/staffora-documents` | Local filesystem path for generated PDFs | Worker |
| `PDF_BASE_URL` | `http://localhost:3000/api/documents` | Base URL for generated document download links | Worker |

---

## File Storage

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `STORAGE_TYPE` | `local` | Storage backend: `local` or `s3` | API, Worker |
| `STORAGE_PATH` | `/tmp/staffora-storage` | Local storage path for uploaded files | API, Worker |
| `STORAGE_BASE_URL` | `http://localhost:{API_PORT}` | Base URL for serving stored files | API |

### S3 Configuration

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `S3_BUCKET` | `staffora-storage` | S3 bucket name for file storage | API |
| `S3_REGION` | `eu-west-2` | AWS region for S3 | API, Worker |
| `S3_ACCESS_KEY` | -- | S3 access key ID | API |
| `S3_SECRET_KEY` | -- | S3 secret access key | API |
| `AWS_ACCESS_KEY_ID` | -- | AWS access key (alternative to `S3_ACCESS_KEY`, used by export worker) | Worker |
| `AWS_SECRET_ACCESS_KEY` | -- | AWS secret key (alternative to `S3_SECRET_KEY`, used by export worker) | Worker |

---

## Email (SMTP)

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `SMTP_HOST` | `localhost` | SMTP server hostname | Worker (notifications) |
| `SMTP_PORT` | `587` | SMTP server port | Worker (notifications) |
| `SMTP_SECURE` | `false` | Use TLS for SMTP connection | Worker (notifications) |
| `SMTP_USER` | -- | SMTP authentication username | Worker (notifications) |
| `SMTP_PASS` | -- | SMTP authentication password (used in code) | Worker (notifications) |
| `SMTP_PASSWORD` | -- | SMTP password (used in Docker Compose, alias for `SMTP_PASS`) | Docker Compose |
| `SMTP_FROM` | `noreply@staffora.co.uk` | Default sender email address | Worker (notifications) |

> **Note:** Both `SMTP_PASS` and `SMTP_PASSWORD` appear in the codebase. The notification worker reads `SMTP_PASS`; Docker Compose maps `SMTP_PASSWORD`. Ensure both are set to the same value, or consolidate in your `.env` file.

---

## Push Notifications

### Web Push (VAPID)

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `VAPID_PUBLIC_KEY` | -- | VAPID public key for web push. Generate with `npx web-push generate-vapid-keys`. | API, Worker |
| `VAPID_PRIVATE_KEY` | -- | VAPID private key for web push | Worker (notifications) |
| `VAPID_SUBJECT` | `mailto:noreply@staffora.co.uk` | VAPID subject (contact email) | Worker (notifications) |

### Firebase Cloud Messaging (FCM)

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `FIREBASE_SERVICE_ACCOUNT_PATH` | -- | Path to Firebase service account JSON file | Worker (notifications) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | -- | Firebase service account JSON as a string (alternative to file path) | Worker (notifications) |

---

## Virus Scanning (ClamAV)

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `CLAMAV_ENABLED` | `false` | Enable ClamAV virus scanning for uploads. Requires the `scanning` Docker profile. | API, Worker |
| `CLAMAV_HOST` | `localhost` / `clamav` (Docker) | ClamAV daemon hostname | API, Worker |
| `CLAMAV_PORT` | `3310` | ClamAV daemon TCP port | API, Worker |
| `CLAMAV_TIMEOUT` | `30000` | Scan timeout in milliseconds | API, Worker |

> **Behaviour:** When `CLAMAV_ENABLED=false` (default), uploads proceed without scanning. When `true` and ClamAV is unreachable, uploads proceed in degraded mode with a warning logged (fail-open).

---

## Observability: OpenTelemetry

Distributed tracing via OpenTelemetry. Traces are sent to Grafana Tempo (or any OTLP-compatible collector) via OTLP HTTP.

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `OTEL_ENABLED` | `false` | Enable distributed tracing. Set to `true` to activate. | API, Worker |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP HTTP endpoint for trace export | API, Worker |
| `OTEL_SERVICE_NAME` | `staffora-api` | Service name reported in traces | API, Worker |
| `OTEL_SERVICE_VERSION` | `0.1.0` | Service version reported in traces | API, Worker |
| `OTEL_SAMPLE_RATE` | `1.0` (dev) / `0.1` (prod) | Trace sampling rate (0.0 to 1.0). Overrides environment default. | API, Worker |
| `OTEL_TRACES_SAMPLER_ARG` | -- | Standard OTel sampling ratio env var. Alternative to `OTEL_SAMPLE_RATE`. | API, Worker |
| `OTEL_CONSOLE_EXPORTER` | `true` (dev) / `false` (prod) | Log spans to console for debugging | API, Worker |

### Docker Compose (Tempo)

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `TEMPO_OTLP_GRPC_PORT` | `4317` | Tempo OTLP gRPC port | Docker Compose |
| `TEMPO_OTLP_HTTP_PORT` | `4318` | Tempo OTLP HTTP port | Docker Compose |
| `TEMPO_HTTP_PORT` | `3200` | Tempo query API port | Docker Compose |

---

## Observability: Sentry

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `SENTRY_DSN` | -- | Sentry Data Source Name. When unset, Sentry is disabled. | API, Worker |
| `SENTRY_ENVIRONMENT` | Value of `NODE_ENV` | Sentry environment tag | API, Worker |
| `SENTRY_RELEASE` | `staffora-{process}@{version}` | Sentry release identifier | API, Worker |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` | Sentry transaction sampling rate (0.0 to 1.0) | API, Worker |

---

## Observability: Logging

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `LOG_LEVEL` | `debug` (dev) / `info` (prod) | Pino log level: `debug`, `info`, `warn`, `error` | API, Worker |

> **Format:** Production outputs structured JSON; development uses pretty-printed coloured output. Sensitive fields (passwords, tokens, secrets, cookies) are automatically redacted.

---

## Observability: Monitoring Stack

Used by the monitoring Docker Compose profile (`--profile monitoring`).

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `LOKI_PORT` | `3101` | Loki HTTP API host port | Docker Compose |
| `LOKI_RETENTION_PERIOD` | `720h` | Log retention period (30 days default) | Docker Compose |
| `GRAFANA_PORT` | `3100` | Grafana dashboard host port | Docker Compose |
| `GRAFANA_ADMIN_USER` | `admin` | Grafana admin username | Docker Compose |
| `GRAFANA_ADMIN_PASSWORD` | `staffora` | Grafana admin password | Docker Compose |
| `GRAFANA_ROOT_URL` | `http://localhost:3100` | Grafana external URL | Docker Compose |
| `PROMETHEUS_PORT` | `9090` | Prometheus host port | Docker Compose |

---

## Database Backups

Managed by the backup sidecar container.

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `BACKUP_RETENTION_DAYS` | `7` | Local backup retention in days | Backup sidecar |
| `BACKUP_SCHEDULE` | `0 2 * * *` | Cron expression for backup schedule (default: daily at 02:00 UTC) | Backup sidecar |
| `BACKUP_ON_START` | `false` | Run backup immediately on container start | Backup sidecar |

### S3 Offsite Backup

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `S3_BACKUP_BUCKET` | -- | S3 bucket for offsite backups. When unset, only local backups are created. | Backup sidecar |
| `S3_BACKUP_PREFIX` | `backups/staffora/` | S3 key prefix for backup files | Backup sidecar |
| `S3_BACKUP_STORAGE_CLASS` | `STANDARD_IA` | S3 storage class for backup objects | Backup sidecar |
| `AWS_DEFAULT_REGION` | `eu-west-2` | AWS region for S3 backup operations | Backup sidecar |
| `AWS_ACCESS_KEY_ID` | -- | AWS credentials for S3 backup | Backup sidecar |
| `AWS_SECRET_ACCESS_KEY` | -- | AWS credentials for S3 backup | Backup sidecar |

### S3 Retention Policy

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `S3_DAILY_RETENTION` | `30` | Days to retain daily S3 backups | Backup sidecar |
| `S3_WEEKLY_RETENTION` | `90` | Days to retain weekly S3 backups | Backup sidecar |
| `S3_MONTHLY_RETENTION` | `365` | Days to retain monthly S3 backups | Backup sidecar |

### Backup Verification

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `VERIFY_BACKUP` | `weekly` | Backup verification mode: `false`, `true`/`always`, or `weekly` | Backup sidecar |
| `VERIFY_BACKUP_DAY` | `7` | Day of week for weekly verification (1=Monday, 7=Sunday) | Backup sidecar |

---

## WAL Archiving and PITR

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `WAL_ARCHIVE_RETENTION_DAYS` | `7` | Retention for archived WAL files in days | Docker Compose |

> WAL archiving is enabled by default in `postgresql.conf`. See `Docs/operations/point-in-time-recovery.md` for the full recovery procedure.

---

## SSO (SAML/OIDC)

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `SSO_ENCRYPTION_KEY` | Falls back to `BETTER_AUTH_SECRET`, then `SESSION_SECRET` | Encryption key for SSO provider client secrets stored in the database | API (SSO module) |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend URL for SSO callback redirects | API (SSO module) |

---

## Bootstrap (First-Time Setup)

Used by `bun run --filter @staffora/api bootstrap:root` to create the initial tenant and admin user.

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `ROOT_TENANT_NAME` | `Staffora` | Root tenant display name | Bootstrap script |
| `ROOT_TENANT_SLUG` | -- | Root tenant URL slug | Bootstrap script |
| `ROOT_TENANT_ID` | -- (auto-generated UUID) | Root tenant UUID | Bootstrap script |
| `ROOT_EMAIL` | `root@staffora.co.uk` | Root admin user email | Bootstrap script |
| `ROOT_PASSWORD` | -- (auto-generated) | Root admin user password | Bootstrap script |
| `ROOT_NAME` | `Root` | Root admin user display name | Bootstrap script |

> **Note:** The `.env.example` uses `ROOT_USER_EMAIL`, `ROOT_USER_PASSWORD`, and `ROOT_USER_NAME` but the bootstrap script reads `ROOT_EMAIL`, `ROOT_PASSWORD`, and `ROOT_NAME`. Ensure you set the variable names that the script expects.

---

## TLS Certificates

Used by `scripts/init-letsencrypt.sh` for first-time certificate provisioning.

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `CERTBOT_DOMAINS` | -- | Space-separated list of domains for the TLS certificate | Let's Encrypt script |
| `CERTBOT_EMAIL` | -- | Email address for Let's Encrypt expiry notifications | Let's Encrypt script |

---

## Feature Flags

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `FEATURE_MFA_REQUIRED` | `false` | Enable MFA requirement for all users | API |
| `FEATURE_AUDIT_ENABLED` | `true` | Enable audit logging | API |
| `FEATURE_RATE_LIMIT_ENABLED` | `true` | Enable API rate limiting. Set to `false` to disable. | API |

---

## Testing

These variables are used by the test infrastructure. They are set automatically by `src/test/preload.ts` if not already defined.

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `TEST_DATABASE_URL` | -- | PostgreSQL URL for test database | Tests |
| `TEST_DB_HOST` | `localhost` | Test database host | Tests |
| `TEST_DB_PORT` | `5432` | Test database port | Tests |
| `TEST_DB_NAME` | `hris` | Test database name | Tests |
| `TEST_DB_USER` | `hris_app` | Test database username | Tests |
| `TEST_DB_PASSWORD` | `hris_app_dev_password` | Test database password | Tests |
| `TEST_DB_ADMIN_USER` | `hris` | Test database admin username (for migrations) | Tests |
| `TEST_DB_ADMIN_PASSWORD` | `hris_dev_password` | Test database admin password | Tests |
| `TEST_REDIS_PASSWORD` | `staffora_redis_dev` | Test Redis password | Tests |
| `REQUIRE_TEST_DB` | `false` | When `true`, database connection tests fail instead of skip | Tests |
| `MIGRATIONS_DIR` | Auto-detected | Override path to migrations directory | Migrations |

---

## Uptime Monitoring

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `UPTIME_KUMA_PORT` | `3002` | Host port for Uptime Kuma dashboard | Docker Compose |

---

## Horizontal Scaling

| Variable | Default | Description | Used By |
|----------|---------|-------------|---------|
| `API_REPLICAS` | `3` | Number of API replicas (used by `docker-compose.scale.yml`) | Docker Compose |

---

## Quick Reference: Minimum Development Setup

For local development with Docker, the minimum `.env` file needs:

```bash
# docker/.env (minimum for local development)
POSTGRES_PASSWORD=hris_dev_password
DATABASE_URL=postgres://hris:hris_dev_password@localhost:5432/hris
SESSION_SECRET=$(openssl rand -base64 32)
CSRF_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
```

Everything else will use sensible development defaults.

## Quick Reference: Production Essentials

For production deployments, these additional variables are critical:

```bash
NODE_ENV=production
CORS_ORIGIN=https://app.staffora.co.uk
BETTER_AUTH_URL=https://api.staffora.co.uk
APP_URL=https://app.staffora.co.uk
VITE_API_URL=https://api.staffora.co.uk

# Strong unique secrets (32+ chars each)
POSTGRES_PASSWORD=<strong-password>
SESSION_SECRET=<generated-secret>
CSRF_SECRET=<generated-secret>
BETTER_AUTH_SECRET=<generated-secret>

# Email
SMTP_HOST=<smtp-server>
SMTP_USER=<user>
SMTP_PASS=<password>
SMTP_FROM=noreply@staffora.co.uk

# Storage
STORAGE_TYPE=s3
S3_BUCKET=staffora-production
S3_REGION=eu-west-2
S3_ACCESS_KEY=<key>
S3_SECRET_KEY=<secret>
```
