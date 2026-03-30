# Integrations

> External service integrations, webhook delivery, and third-party configuration for the Staffora platform.

## Directory Contents

| File | Description |
|------|-------------|
| [README.md](README.md) | This file -- detailed integration reference for S3, email, Firebase, Redis, BetterAuth, Sentry, Pino, and HMRC |
| [external-services.md](external-services.md) | Comprehensive external service integration guide with configuration, error handling, and usage patterns |
| [webhook-system.md](webhook-system.md) | Outbound webhook system for delivering domain events to external systems in real time |

---

## Table of Contents

- [S3 / Object Storage](#s3--object-storage)
- [Email (SMTP / Nodemailer)](#email-smtp--nodemailer)
- [Firebase (Push Notifications)](#firebase-push-notifications)
- [Redis](#redis)
- [BetterAuth](#betterauth)
- [Sentry (Error Tracking)](#sentry-error-tracking)
- [Logging (Pino)](#logging-pino)
- [HMRC (Planned)](#hmrc-planned)
- [Related Documents](#related-documents)

---

## S3 / Object Storage

### Purpose

File storage for document uploads, export files, PDF generation output, and employee attachments. Supports both local filesystem (development) and S3-compatible storage (production).

### Architecture

The storage layer is defined in `packages/api/src/lib/storage.ts` and provides a unified `StorageService` interface with two implementations:

- **`LocalStorageService`** -- Stores files on the local filesystem. Used in development. Files are served via the API server at `/api/v1/documents/files/:fileKey`.
- **`S3StorageService`** -- Stores files in an S3-compatible bucket. Used in production. Generates presigned URLs so clients upload/download directly from S3, bypassing the API server for large files.

The backend selects the implementation at startup based on the `STORAGE_TYPE` environment variable and exposes it as a singleton via `getStorageService()`.

### Interface

```typescript
interface StorageService {
  getUploadUrl(fileKey: string, mimeType: string, expiresIn?: number): Promise<string>;
  getDownloadUrl(fileKey: string, expiresIn?: number): Promise<string>;
  save(fileKey: string, content: Buffer | string, mimeType?: string): Promise<string>;
  delete(fileKey: string): Promise<void>;
}
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STORAGE_TYPE` | No | `local` | Storage backend: `local` or `s3` |
| `STORAGE_PATH` | No | `/tmp/staffora-storage` | Local storage directory (local mode only) |
| `STORAGE_BASE_URL` | No | `http://localhost:3000` | Base URL for local file serving |
| `S3_BUCKET` | Yes (if s3) | `staffora-storage` | S3 bucket name |
| `S3_REGION` | No | `eu-west-2` | AWS region |
| `S3_ACCESS_KEY` | No | -- | AWS access key (falls back to default credential chain) |
| `S3_SECRET_KEY` | No | -- | AWS secret key |

### Usage Patterns

**Document uploads** use presigned URLs: the API generates a presigned upload URL, returns it to the client, and the client PUTs the file directly to S3. This avoids routing large files through the API server.

**Background workers** (export-worker, pdf-worker) use `save()` to write generated files directly from the server process, then provide a presigned download URL to the user.

**Export-specific storage** has separate configuration for the export worker:

| Variable | Default | Description |
|----------|---------|-------------|
| `S3_EXPORT_BUCKET` | `staffora-exports` | Dedicated bucket for exports |
| `S3_EXPORT_PREFIX` | `exports/` | Key prefix within the bucket |
| `EXPORT_STORAGE_PATH` | `/tmp/staffora-exports` | Local export directory (dev) |
| `EXPORT_BASE_URL` | `http://localhost:3000/api/exports` | Local export download base URL |

### Security

- **Path traversal protection**: Local storage rejects file keys containing `..` or absolute paths.
- **Presigned URL expiry**: Upload URLs expire after 15 minutes (default). Download URLs expire after 1 hour (default).
- **MIME type inference**: Automatic MIME type detection from file extension when not explicitly provided.

### Key Files

- `packages/api/src/lib/storage.ts` -- StorageService interface and implementations
- `packages/api/src/jobs/export-worker.ts` -- Export-specific storage usage
- `packages/api/src/modules/documents/` -- Document management module

---

## Email (SMTP / Nodemailer)

### Purpose

Sends transactional emails for notifications including welcome emails, password resets, leave request approvals, and generic system notifications.

### Architecture

The email system is defined in `packages/api/src/jobs/notification-worker.ts` and uses a `Mailer` interface with two implementations:

- **`ConsoleMailer`** -- Logs emails to the console instead of sending. Used in development (`NODE_ENV !== "production"`).
- **`SmtpMailer`** -- Sends emails via SMTP using the `nodemailer` package. Used in production.

Emails are sent asynchronously via the notification worker (Redis Streams), not inline with API requests.

### Template System

Built-in templates use simple `{{variable}}` placeholder substitution. Available templates:

| Template | Purpose | Variables |
|----------|---------|-----------|
| `welcome` | New user welcome | `companyName`, `firstName`, `loginUrl` |
| `password_reset` | Password reset link | `firstName`, `resetUrl`, `expiresIn` |
| `leave_request` | Leave request notification | `employeeName`, `leaveType`, `startDate`, `endDate`, `totalDays`, `reason`, `actionUrl` |
| `approval_required` | Generic approval notification | `requestType`, `requesterName`, `details`, `actionUrl` |
| `notification` | Generic notification | `subject`, `title`, `message`, `actionUrl`, `actionText` |

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | Yes (prod) | `localhost` | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_SECURE` | No | `false` | Use TLS (`true` for port 465) |
| `SMTP_USER` | No | -- | SMTP authentication username |
| `SMTP_PASS` | No | -- | SMTP authentication password |
| `SMTP_FROM` | No | `noreply@staffora.co.uk` | Default sender address |

### Email Payload Structure

```typescript
interface EmailNotificationPayload {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  template?: string;           // Template name
  templateData?: Record<string, unknown>;  // Template variables
  textBody?: string;           // Plain text (if no template)
  htmlBody?: string;           // HTML (if no template)
  attachments?: Array<{
    filename: string;
    content: string;           // Base64 encoded
    contentType: string;
  }>;
  replyTo?: string;
  headers?: Record<string, string>;
}
```

### Delivery Tracking

All email delivery attempts (successes and failures) are recorded in the `app.notification_deliveries` table with channel, recipient, subject, message ID, and error details.

### Key Files

- `packages/api/src/jobs/notification-worker.ts` -- Mailer implementations and template engine

---

## Firebase (Push Notifications)

### Purpose

Delivers push notifications to mobile and web clients via Firebase Cloud Messaging (FCM).

### Architecture

Firebase is integrated via `firebase-admin` SDK, lazily initialized on first use. Push notifications are processed by the notification worker alongside email and in-app notifications.

The system:
1. Looks up the user's registered push tokens from `app.push_tokens`
2. Sends multicast messages to all active FCM tokens
3. Automatically disables invalid/expired tokens
4. Records delivery results in `app.notification_deliveries`

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FIREBASE_SERVICE_ACCOUNT_PATH` | No | -- | Path to Firebase service account JSON file |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | No | -- | Firebase service account JSON (inline, for containerized deployments) |

At least one of these must be set for push notifications to be active. If neither is set, push notifications are silently skipped with a warning log.

### Push Payload Structure

```typescript
interface PushNotificationPayload {
  userId: string;
  title: string;
  body: string;
  icon?: string;
  badge?: number;
  sound?: string;          // Default: "default"
  clickAction?: string;    // URL to open on click
  data?: Record<string, unknown>;
  ttl?: number;            // Time to live in seconds (default: 86400)
}
```

### Token Management

Push tokens are stored in `app.push_tokens` with fields:
- `token` -- The FCM registration token
- `platform` -- One of `fcm`, `android`, `web`
- `enabled` -- Active/inactive flag
- `expires_at` -- Optional token expiry

Invalid tokens (error code `messaging/registration-token-not-registered`) are automatically disabled after a failed send attempt.

### Key Files

- `packages/api/src/jobs/notification-worker.ts` -- Push notification processor (lines 570-726)

---

## Redis

### Purpose

Redis 7 serves three distinct roles in the platform:

1. **Caching** -- Session data, permission lookups, tenant settings, rate limiting
2. **Job Queues** -- Redis Streams for asynchronous background job processing
3. **Distributed Locking** -- Resource-level locks to prevent concurrent mutations

### Architecture

Redis connectivity is managed by the cache plugin (`packages/api/src/plugins/cache.ts`) which provides a `CacheClient` wrapper with tenant-scoped key prefixing, TTL management, and automatic reconnection.

Background workers connect to Redis independently via `ioredis` for Stream operations.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | No | `redis://localhost:6379` | Full Redis connection URL |
| `REDIS_HOST` | No | `localhost` | Redis hostname (if not using URL) |
| `REDIS_PORT` | No | `6379` | Redis port |
| `REDIS_PASSWORD` | No | -- | Redis authentication password |
| `REDIS_DB` | No | `0` | Redis database number |
| `REDIS_KEY_PREFIX` | No | `staffora:` | Key prefix for namespace isolation |
| `REDIS_MAX_RETRIES` | No | `3` | Maximum connection retry attempts |
| `REDIS_RETRY_DELAY` | No | `500` | Retry delay in milliseconds |
| `REDIS_CONNECT_TIMEOUT` | No | `10000` | Connection timeout in milliseconds |
| `REDIS_COMMAND_TIMEOUT` | No | `5000` | Command timeout in milliseconds |

### Caching Strategy

Standard TTL values defined in `CacheTTL`:

| Constant | TTL | Use Case |
|----------|-----|----------|
| `SHORT` | 1 minute | Volatile data |
| `SESSION` | 5 minutes | Session cookie cache |
| `MEDIUM` | 15 minutes | Frequently accessed data |
| `PERMISSIONS` | 15 minutes | User permission lookups |
| `EMPLOYEE` | 10 minutes | Employee basic data |
| `LONG` | 1 hour | Rarely changing data |
| `REFERENCE` | 24 hours | Reference data (leave types, org tree) |

### Cache Key Patterns

| Pattern | Example | Purpose |
|---------|---------|---------|
| `session:{sessionId}` | `session:abc123` | Session data |
| `perms:{tenantId}:{userId}` | `perms:uuid1:uuid2` | Permission cache |
| `roles:{tenantId}:{userId}` | `roles:uuid1:uuid2` | Role assignments |
| `tenant:{tenantId}:settings` | `tenant:uuid1:settings` | Tenant settings |
| `org:{tenantId}:tree` | `org:uuid1:tree` | Organization tree |
| `emp:{tenantId}:{empId}:basic` | `emp:uuid1:uuid2:basic` | Employee basic info |
| `rate:{tenantId}:{userId}:{endpoint}` | -- | Rate limiting counters |
| `lock:{resource}` | `lock:employee:uuid` | Distributed locks |

### Redis Streams (Job Queues)

Background jobs use Redis Streams with consumer groups for reliable at-least-once delivery:

| Stream | Consumer Group | Purpose |
|--------|---------------|---------|
| `staffora:notifications` | `staffora-workers` | Email, in-app, and push notifications |
| `staffora:exports` | `staffora-workers` | CSV and Excel file generation |
| `staffora:pdfs` | `staffora-workers` | PDF document generation |
| `staffora:analytics` | `staffora-workers` | Analytics aggregation |

### Worker Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_ID` | `worker-{pid}` | Unique consumer identifier |
| `WORKER_GROUP` | `staffora-workers` | Consumer group name |
| `WORKER_CONCURRENCY` | `5` | Maximum concurrent jobs |
| `WORKER_POLL_INTERVAL` | `1000` | Polling interval (ms) |
| `WORKER_BLOCK_TIMEOUT` | `5000` | XREADGROUP block timeout (ms) |
| `WORKER_MAX_RETRIES` | `10` | Max retries before dead letter |
| `WORKER_CLAIM_TIMEOUT` | `60000` | Pending message claim timeout (ms) |

### Key Files

- `packages/api/src/plugins/cache.ts` -- CacheClient, CacheTTL, CacheKeys
- `packages/api/src/jobs/base.ts` -- Worker infrastructure and Redis Streams
- `packages/api/src/worker/outbox-processor.ts` -- Outbox event publishing to streams
- `packages/api/src/worker.ts` -- Worker entry point

---

## BetterAuth

### Purpose

Provides session-based authentication with email/password sign-in, MFA (TOTP), and organization management. BetterAuth is the sole authentication provider for the platform -- no custom auth implementations are permitted.

### Architecture

BetterAuth is configured in `packages/api/src/lib/better-auth.ts` as a singleton. It uses a standard `pg` Pool (not postgres.js) connecting to the `app` schema. The Elysia plugin (`betterAuthPlugin`) forwards all `/api/auth/*` requests to BetterAuth's handler.

### Dual-Table User Model

BetterAuth maintains its own tables (`app."user"`, `app."account"`, `app."session"`, `app."verification"`) alongside the legacy `app.users` table. Database hooks in the BetterAuth configuration keep both tables in sync:

- **On user create**: Inserts/upserts into `app.users` with matching UUID
- **On user update**: Syncs changes to `app.users`

Both tables must be updated atomically for any user modification. The `adminUnlockAccount()` function demonstrates this pattern.

### Password Handling

The platform supports two password hash formats for backwards compatibility:

- **bcrypt** (`$2a$`, `$2b$`, `$2y$` prefix) -- Legacy hashes, verified via `bcryptjs`
- **scrypt** (Better Auth default, `salt:key` hex format) -- New users created through Better Auth

The custom `verifyPassword` function detects the hash format and delegates to the appropriate verifier. New passwords are hashed with bcrypt (12 rounds) for consistency.

### Session Configuration

| Setting | Value | Description |
|---------|-------|-------------|
| Cookie prefix | `staffora` | All auth cookies prefixed |
| Session duration | 7 days | Maximum session lifetime |
| Session update age | 24 hours | Sliding window refresh |
| Cookie cache | 5 minutes | Client-side session cache |
| SameSite | `strict` (prod) / `lax` (dev) | CSRF protection |
| Secure cookies | Production only | HTTPS-only cookies |

### Plugins

- **`twoFactor`** -- TOTP-based MFA with 6-digit codes, 30-second period
- **`dash`** -- Better Auth Infra dashboard integration
- **`organization`** -- Organization/tenant management

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BETTER_AUTH_SECRET` | Yes (prod) | Insecure dev default | Primary encryption secret (32+ chars) |
| `SESSION_SECRET` | No | Falls back to `BETTER_AUTH_SECRET` | Session signing secret (32+ chars) |
| `CSRF_SECRET` | No | -- | CSRF token signing secret (32+ chars) |
| `BETTER_AUTH_URL` | No | `http://localhost:3000` | Base URL for auth callbacks |
| `BETTER_AUTH_API_KEY` | No | -- | Better Auth Infra dashboard key |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Trusted origins (comma-separated) |
| `DATABASE_APP_URL` | No | Falls back to `DATABASE_URL` | Database URL for auth (prefers `hris_app` role) |

### Secret Validation

At startup, `packages/api/src/config/secrets.ts` validates all authentication secrets:
- Checks minimum length (32 characters)
- Rejects known insecure defaults (e.g., `change-me`, `password`, `12345`)
- In production: crashes the process on validation failure
- In development: logs warnings but allows startup

### Key Files

- `packages/api/src/lib/better-auth.ts` -- BetterAuth configuration and singleton
- `packages/api/src/plugins/auth.ts` -- Elysia auth plugin (session/user resolution)
- `packages/api/src/config/secrets.ts` -- Startup secret validation
- `packages/api/src/scripts/bootstrap-root.ts` -- Root tenant/admin user creation

---

## Sentry (Error Tracking)

### Purpose

Captures unhandled exceptions and application errors in production with request context (request ID, tenant ID, user ID) for debugging.

### Architecture

Sentry is configured in `packages/api/src/lib/sentry.ts` with lazy initialization. If `SENTRY_DSN` is not set, all Sentry functions are safe no-ops -- the application runs without error tracking.

### PII Scrubbing

All Sentry events pass through a `beforeSend` scrubber that:

- **Redacts sensitive keys**: `password`, `secret`, `token`, `authorization`, `nationalInsuranceNumber`, `niNumber`, `nino`, `sortCode`, `accountNumber`, `bankAccountNumber`
- **Strips emails**: Replaces email addresses with `[EMAIL_REDACTED]`
- **Strips NI numbers**: Replaces UK National Insurance Numbers with `[NI_REDACTED]`
- **Removes query strings**: Redacts URL query parameters that may contain tokens

### Filtered Errors

These errors are silently ignored (not sent to Sentry):
- `CSRF token is required`
- `Rate limit exceeded`

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SENTRY_DSN` | No | -- | Sentry Data Source Name (enables tracking) |
| `SENTRY_ENVIRONMENT` | No | `NODE_ENV` value | Environment label in Sentry |
| `SENTRY_TRACES_SAMPLE_RATE` | No | `0.1` (10%) | Performance monitoring sample rate |
| `SENTRY_RELEASE` | No | `staffora-{process}@{version}` | Release version identifier |

### Public API

```typescript
// Capture an exception with context
await captureException(error, {
  requestId: "req-123",
  tenantId: "tenant-uuid",
  userId: "user-uuid",
  path: "/api/v1/hr/employees",
  method: "POST",
  extra: { employeeId: "emp-uuid" },
});

// Capture an informational message
await captureMessage("Export completed", "info");

// Set user context on current scope
await setUser({ id: "user-uuid", email: "user@example.com" });

// Add breadcrumb for debugging trail
await addBreadcrumb({
  category: "employee",
  message: "Employee created",
  level: "info",
  data: { employeeId: "emp-uuid" },
});

// Flush events before shutdown
await flushSentry(2000);
```

### Key Files

- `packages/api/src/lib/sentry.ts` -- Sentry initialization and helpers

---

## Logging (Pino)

### Purpose

Structured JSON logging for the API and worker processes, with automatic PII redaction and request-scoped child loggers.

### Architecture

The logger is a `pino` instance configured in `packages/api/src/lib/logger.ts`:

- **Production**: Outputs structured JSON for log aggregation (ELK, Datadog, CloudWatch)
- **Development**: Pretty-prints with colors, timestamps, and human-readable formatting via `pino-pretty`

### Automatic Redaction

The following fields are automatically replaced with `[REDACTED]` in all log output:
- `password`, `secret`, `token`, `authorization`, `cookie`
- Nested variants: `*.password`, `*.secret`, `*.token`, `*.authorization`, `*.cookie`

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` (prod) / `debug` (dev) | Minimum log level |

### Request-Scoped Logging

```typescript
import { createRequestLogger } from "../lib/logger";

const log = createRequestLogger({
  requestId: "req-abc",
  tenantId: "tenant-uuid",
  userId: "user-uuid",
  method: "POST",
  path: "/api/v1/hr/employees",
});

log.info({ employeeId }, "employee created");
```

### Key Files

- `packages/api/src/lib/logger.ts` -- Logger configuration and child logger factory

---

## HMRC (Planned)

### Purpose

Integration with HMRC (Her Majesty's Revenue and Customs) for UK tax code management, Real Time Information (RTI) payroll submissions, and pension auto-enrolment reporting.

### Planned Integration Points

| Feature | HMRC Service | Status |
|---------|-------------|--------|
| Tax code retrieval | HMRC Tax Coding API | Planned |
| RTI submissions (FPS) | HMRC PAYE Online | Planned |
| RTI submissions (EPS) | HMRC PAYE Online | Planned |
| P45/P60 generation | Internal + HMRC data | Planned |
| Student loan deductions | HMRC SL1/SL2 notices | Planned |
| Pension auto-enrolment | The Pensions Regulator | Planned |
| Apprenticeship Levy | HMRC DAS | Planned |

### Existing Foundation

The platform already includes UK compliance modules that will connect to HMRC:

- `packages/api/src/modules/ssp/` -- Statutory Sick Pay calculations
- `packages/api/src/modules/statutory-leave/` -- Statutory maternity/paternity/adoption leave
- `packages/api/src/modules/pension/` -- Workplace pension management
- `packages/api/src/modules/right-to-work/` -- Right to work document verification
- `migrations/0186_uk_compliance_cleanup.sql` -- UK-specific schema (WTR status, SOC codes)

### Security Requirements

HMRC integration will require:
- OAuth 2.0 authentication with HMRC's sandbox and production APIs
- Government Gateway credentials management
- Encrypted storage of tax-sensitive data
- Audit trail for all HMRC submissions
- GDPR-compliant data handling for payroll data

---

## Related Documents

- [Architecture Overview](../02-architecture/ARCHITECTURE.md) -- System design and request flow
- [Database Reference](../02-architecture/DATABASE.md) -- Schema, migrations, RLS details
- [Worker System](../02-architecture/WORKER_SYSTEM.md) -- Background job processing architecture
- [Security Patterns](../02-architecture/security-patterns.md) -- Authentication, authorization, and audit
- [Deployment Guide](../05-development/DEPLOYMENT.md) -- Production deployment configuration
- [Error Codes Reference](../04-api/ERROR_CODES.md) -- API error codes by module
- [UK Compliance](../12-compliance/uk-hr-compliance-report.md) -- UK regulatory requirements
