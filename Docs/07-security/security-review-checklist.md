# Staffora Platform — Security Review Checklist

*Last updated: 2026-03-28*

**Reviewer:** Claude Security Reviewer
**Date:** 2026-03-14
**Scope:** Full codebase review — Bun + Elysia.js + PostgreSQL + Redis multi-tenant HRIS

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| CRITICAL | 1 | Admin unlock endpoint missing RBAC guard |
| HIGH | 3 | Bank details unencrypted, PII identifiers unencrypted, `console.error` in production modules |
| MEDIUM | 3 | `SESSION_SECRET`/`CSRF_SECRET` not required, `unsafe-inline` in CSP style-src, dev password in .env.example comments |
| PASS | 27 | All other checks below |

---

## 1. Secrets Management

### 1.1 Startup Secret Validation
**PASS**

`packages/api/src/config/secrets.ts` validates `BETTER_AUTH_SECRET` (required, min 32 chars) and checks against a list of 9 known insecure defaults. On `NODE_ENV=production` it calls `process.exit(1)` on failure. On development it logs warnings.

Known-insecure list includes: `change-me`, `development-secret-change-in-production`, `dev_session_secret_32chars_min`, `secret`, `password`, `12345`.

Weakness (MEDIUM): `SESSION_SECRET` and `CSRF_SECRET` are listed as `required: false` — they fall back to `BETTER_AUTH_SECRET` silently. If only `BETTER_AUTH_SECRET` is set all three secrets derive from the same material. Distinct secrets are best practice.

### 1.2 .env.example Placeholder Values
**PASS** (with MEDIUM note)

`docker/.env.example` uses placeholder `change-me-use-openssl-rand-base64-32` for all three secrets. The startup validator in 1.1 would reject this value in production.

MEDIUM note: The file shows `POSTGRES_PASSWORD=hris_dev_password` and `DATABASE_URL=postgres://hris:hris_dev_password@...` with a comment "Development default". This is acceptable for a dev default but the comment "In production, change this to a secure password" is the only guard. Consider adding an explicit validator for `POSTGRES_PASSWORD` that fires in production.

### 1.3 .gitignore Covers .env Files
**PASS**

`.gitignore` explicitly ignores:
- `.env`
- `.env.local`
- `.env*.local`
- `docker/.env`

And keeps examples: `!.env.example`, `!docker/.env.example`.

### 1.4 Hardcoded Secrets Scan
**PASS** (test files are false positives)

Scan results for `password = "..."`, `secret = "..."`, `token = "..."` in source files:

All matches found are in test files under `packages/api/src/test/` using clearly test-only strings such as `"TestPassword123!"` and `"SuperSecurePassword123!"`. These are expected and acceptable.

No matches for patterns `sk-`, `ghp_`, or `Bearer [token]` in production source files.

No API keys, secrets, or tokens found hardcoded in `packages/api/src/modules/`, `packages/api/src/plugins/`, or `packages/api/src/lib/`.

---

## 2. Input Validation

### 2.1 TypeBox Schemas on API Routes (5-module sample)
**PASS**

Sampled modules all enforce TypeBox schemas:

- **HR module** (`packages/api/src/modules/hr/routes.ts`): Full schema suite — `CreateEmployeeSchema`, `UpdateEmployeePersonalSchema`, `EmployeeFiltersSchema`, `IdParamsSchema`, `PaginationQuerySchema`, etc. applied to all body, query, and params.
- **Documents module** (`packages/api/src/modules/documents/routes.ts`): TypeBox on all routes. Upload URL query enforces `pattern: "^[a-zA-Z0-9][a-zA-Z0-9._\\-\\s]*$"` for filename and `pattern: "^[a-z]+\\/[a-zA-Z0-9.+\\-]+$"` for MIME type.
- **Bank Details module** (`packages/api/src/modules/bank-details/schemas.ts`): sort_code enforces `pattern: "^[0-9]{6}$"`, account_number enforces `pattern: "^[0-9]{8}$"`.
- **Employee Photos module** (`packages/api/src/modules/employee-photos/schemas.ts`): MIME type validated with pattern `^image\\/(jpeg|png|gif|webp|svg\\+xml|bmp)$`, file_key bounded to 500 chars.
- **Dashboard module** (`packages/api/src/modules/dashboard/routes.ts`): Uses `requirePermission` guards and query schemas.

### 2.2 File Upload Validation
**PASS**

Employee photos: MIME type is validated via TypeBox pattern to `image/(jpeg|png|gif|webp|svg+xml|bmp)` only. The upload schema validates the file reference metadata; actual file bytes go via presigned URL (not through the API server).

Documents: MIME type validated with TypeBox pattern, filename validated with alphanumeric-plus-safe-chars pattern. File size minimum enforced (`minimum: 1`).

Storage (`packages/api/src/lib/storage.ts`): `LocalStorageService.safePath()` rejects any `fileKey` containing `..` or absolute paths, and validates the resolved path stays within `basePath` after `path.resolve()`.

### 2.3 Request Body Size Limit
**PASS**

`packages/api/src/app.ts` line 742 sets `maxRequestBodySize: 10 * 1024 * 1024` (10 MB) on `app.listen()`. CLAUDE.md notes the Bun default is 128 MB, so this explicit override is correct.

---

## 3. SQL Injection Prevention

### 3.1 tx.unsafe() Usage
**PASS** (with explanation)

The grep for `tx.unsafe(` finds usage in:
- `packages/api/src/modules/data-breach/repository.ts`
- `packages/api/src/modules/geofence/repository.ts`
- `packages/api/src/modules/flexible-working/repository.ts`
- `packages/api/src/modules/time/repository.ts`

In every case, the argument is a **hardcoded constant string** defined at module top level (e.g., `const BREACH_COLUMNS = \`id, tenant_id, title, ...\``). No user input flows into these `unsafe()` calls. This is the documented safe use of `unsafe()` in postgres.js for injecting static column lists.

The migration runner (`packages/api/src/db/migrate.ts`) uses `unsafe()` to execute raw migration SQL files — appropriate and isolated to that tool.

`packages/api/src/lib/better-auth.ts` uses `reserved.unsafe(queryText, parameters)` in the `PostgresJsPool` adapter, but `queryText` originates from the BetterAuth library (not user input), and `parameters` are passed as a separate array (parameterised).

### 3.2 Parameterized Query Compliance
**PASS**

All production repository files use postgres.js tagged template literals: `` tx`SELECT * FROM employees WHERE id = ${id}::uuid` ``. User values are always interpolated via template literals (which postgres.js parameterizes), never via string concatenation.

Spot-checked: `packages/api/src/modules/bank-details/repository.ts` — all 9 queries use template literals. `packages/api/src/modules/hr/repository.ts` — same pattern throughout.

### 3.3 String-Concatenated SQL
**PASS**

No occurrences of patterns such as `"SELECT" + ` or `\`SELECT ... ${variable}\`` (with template-literal interpolation outside a tagged template) found in module SQL queries. The documents template route (`packages/api/src/modules/documents/routes.ts` line 239) uses `${"%" + String(query.search) + "%"}` inside a tagged template literal, which is parameterised correctly by postgres.js.

---

## 4. Authentication and Authorization

### 4.1 Session Cookie Flags
**PASS**

`packages/api/src/lib/better-auth.ts` lines 530-536:

```
advanced: {
  useSecureCookies: process.env["NODE_ENV"] === "production",
  defaultCookieAttributes: {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env["NODE_ENV"] === "production",
  },
},
```

`httpOnly: true` is always set. `secure` and `useSecureCookies` are gated on `NODE_ENV === "production"`. This is correct — secure cookies cannot be set over HTTP in development.

`sameSite: "lax"` provides CSRF protection for top-level navigations. The application also implements custom HMAC-CSRF tokens for mutating API calls (see section 6).

### 4.2 requirePermission() on Protected Routes
**PASS** (with CRITICAL exception — see 4.4)

All five sampled module routes use `beforeHandle: [requirePermission(...)]`. Dashboard routes use `requirePermission("dashboards", "read")`. Security routes, HR routes, document routes, benefit routes all confirmed.

### 4.3 RLS Enabled on Tenant Tables
**PASS**

`migrations/0021_employee_identifiers.sql` and reviewed migration files consistently include:
```sql
ALTER TABLE app.table_name ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.table_name
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

The `hris_app` role is created with `NOBYPASSRLS` (`docker/postgres/01-create-app-role.sh` line 24), ensuring RLS is enforced for all API queries. Confirmed in `docker/postgres/init.sql` line 259.

### 4.4 Admin Account Unlock — Missing RBAC Guard
**FAIL — CRITICAL**

`packages/api/src/modules/auth/routes.ts` lines 248-296:

The `POST /auth/unlock-account` endpoint uses only `beforeHandle: [requireAuthContext]`. This means **any authenticated user** can unlock any other user's account — there is no `requirePermission("users", "admin")` or equivalent role check.

An attacker who compromises any low-privilege account could:
1. Lock a target account via repeated failed logins (triggering the built-in lockout).
2. Immediately unlock it using this unguarded endpoint.
3. Effectively bypass the account lockout protection entirely.

Additionally, this endpoint could be used to unlock a legitimately locked account as part of a credential-stuffing attack.

Remediation:

```typescript
// In packages/api/src/modules/auth/routes.ts
// Replace:
beforeHandle: [requireAuthContext],
// With:
beforeHandle: [requireAuthContext, requirePermission("users", "admin")],
```

Or add a dedicated admin-only RBAC check. The description string claims "Requires authentication and appropriate admin permissions" but no such check is present in the code.

### 4.5 Password Hashing
**PASS**

`packages/api/src/lib/better-auth.ts` uses `bcrypt.hash(password, 12)` (12 rounds, bcryptjs). The minimum password length is 12 characters (`minPasswordLength: 12`), maximum 128. BetterAuth default uses scrypt for new accounts; bcrypt fallback is for legacy users.

---

## 5. XSS Prevention

### 5.1 dangerouslySetInnerHTML
**PASS**

Full scan of `packages/web/` (`.tsx` files) found zero occurrences of `dangerouslySetInnerHTML`.

### 5.2 Content-Security-Policy
**PASS** (with MEDIUM note)

`packages/api/src/plugins/security-headers.ts` sets a CSP on all responses. Default CSP:
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self';
frame-ancestors 'none';
object-src 'none';
base-uri 'self';
form-action 'self';
upgrade-insecure-requests
```

MEDIUM note: `style-src 'unsafe-inline'` is present in the default CSP. While `unsafe-inline` for styles does not enable JavaScript execution, it weakens the CSP and could allow CSS injection. Consider using a nonce or hash-based allowlist for inline styles if any exist, or remove `'unsafe-inline'` if styles are fully external.

### 5.3 Security Header Coverage
**PASS**

Headers confirmed set on all responses by `securityHeadersPlugin`:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` (full policy)
- `Permissions-Policy` (camera, microphone, geolocation, etc. all disabled)
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- `X-Download-Options: noopen`
- `X-Permitted-Cross-Domain-Policies: none`
- `Strict-Transport-Security` (production only)

---

## 6. CSRF Protection

### 6.1 CSRF Token Implementation
**PASS**

`packages/api/src/plugins/auth-better.ts` implements custom HMAC-SHA256 CSRF tokens:
- Token format: `sessionId.timestamp.hmac`
- HMAC signed with `CSRF_SECRET` using `crypto.subtle`
- Constant-time comparison via XOR to prevent timing attacks (`mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)`)
- 24-hour token expiry
- Session binding: token is invalid if used with a different session

`requireCsrf()` guard enforces token on `POST`, `PUT`, `PATCH`, `DELETE` requests. BetterAuth handles its own CSRF for `/api/auth/*` endpoints.

### 6.2 Cookie SameSite
**PASS** — `sameSite: "lax"` set on all session cookies (see 4.1).

### 6.3 Frontend Sends CSRF Token
WARN: Not verified in this review — the frontend API client (`packages/web/app/lib/api-client.ts`) was not examined for `X-CSRF-Token` header inclusion. This should be verified separately.

---

## 7. Rate Limiting

### 7.1 Rate Limit Configuration
**PASS**

`packages/api/src/plugins/rate-limit.ts` implements per-tenant/user/endpoint rate limiting via Redis. Defaults: 100 requests/minute from env `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW`.

Auth-specific stricter limits hardcoded:
- `POST /api/auth/sign-in`: 5 requests/60s per IP
- `POST /api/auth/sign-up`: 3 requests/60s per IP
- `POST /api/auth/forgot-password`: 3 requests/60s per IP
- `GET /api/auth/verify-*`: 5 requests/60s per IP

These limits are keyed by `auth:rate_limit:{ip}:{method}:{path}` — IP-only keys for auth routes so attackers cannot use authenticated sessions to bypass pre-auth rate limits.

### 7.2 Rate Limiting in Production
**PASS**

Rate limiting is enabled by default when `NODE_ENV !== "test"` and `FEATURE_RATE_LIMIT_ENABLED !== "false"`. The `FEATURE_RATE_LIMIT_ENABLED=true` default is confirmed in `docker/.env.example`. The setting cannot be accidentally disabled in production unless explicitly set to `"false"`.

Setting `FEATURE_RATE_LIMIT_ENABLED=false` in a production `.env` would disable rate limiting entirely — document this risk in operations runbooks.

### 7.3 Rate Limit Headers
**PASS**

Responses include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Window`, and on violation: `Retry-After` and HTTP 429.

---

## 8. Sensitive Data Exposure

### 8.1 Audit Plugin Field Redaction
**PASS**

`packages/api/src/plugins/audit.ts` `sanitizeAuditData()` redacts these fields with `[REDACTED]`:
- `password`, `password_hash`, `passwordHash`
- `mfa_secret`, `mfaSecret`
- `token`, `secret`
- `api_key`, `apiKey`

`createAuditLogger()` calls `sanitizeAuditData()` before recording `newValue`/`oldValue`.

### 8.2 Logger Redaction
**PASS**

`packages/api/src/lib/logger.ts` pino logger configured with `redact` paths:
```
"password", "secret", "token", "authorization", "cookie",
"*.password", "*.secret", "*.token", "*.authorization", "*.cookie"
```
Censored with `[REDACTED]`. This covers nested objects.

### 8.3 console.log with Sensitive Data
**HIGH**

`packages/api/src/modules/auth/routes.ts` uses `console.error()` (not the structured pino logger) in 5 error handlers (lines 74, 122, 170, 220, 271). These bypass the pino redaction rules.

`packages/api/src/modules/absence/service.ts` uses `console.error()` in 15 error handlers.

`packages/api/src/modules/delegations/service.ts` uses `console.error()` in 7 error handlers.

`packages/api/src/modules/benefits/routes.ts` uses `console.error()` in 3 error handlers.

`packages/api/src/modules/security/routes.ts` uses `console.error()` in 1 error handler.

The error messages passed to `console.error()` are typically `error.message` strings, which may include SQL error details, user IDs, or path information that could appear in unstructured server logs. In production, these calls write directly to stdout/stderr without the pino JSON format and without redaction.

Remediation: Replace all `console.error(...)` in production module files with `logger.error(...)` using the imported pino logger. Example for `packages/api/src/modules/auth/routes.ts`:

```typescript
// Replace:
console.error("Get me error:", error instanceof Error ? error.message : "Unknown error");
// With:
logger.error({ err: error instanceof Error ? error.message : String(error), requestId }, "get-me error");
```

### 8.4 Error Responses Leak Stack Traces
**PASS**

`packages/api/src/plugins/errors.ts` `shouldShowDetails()` returns `false` in production, suppressing stack traces. Error responses in production only include `code`, `message`, and `requestId`.

---

## 9. Dependency Security

### 9.1 Lock File Committed
**PASS**

`bun.lock` is present and committed to the repository (visible in git status as a modified tracked file). The previous `bun.lockb` is ignored in `.gitignore` (the binary lockfile format that was replaced by the text `bun.lock` format).

### 9.2 npm audit / Bun Audit
WARN: `npm audit` was not run as part of this automated review. The `bun.lock` file is committed (good), but no evidence of regular audit runs was found in the CI pipeline files examined. The `.github/workflows/security.yml` should include a `bun audit` or equivalent step.

---

## 10. Data Encryption

### 10.1 PII Identifier Values (SSN, Passport, NI Number)
**FAIL — HIGH**

`migrations/0021_employee_identifiers.sql` includes the comment:

> "IMPORTANT: Identifier values should be encrypted at the application layer. This table stores the encrypted values; decryption happens in the app"

However, a search of `packages/api/src/` for `encrypt`, `decrypt`, `pgp_sym_encrypt`, and `pgcrypto` found **zero application-layer encryption calls**. The migration enables the `pgcrypto` extension (`migrations/0001_extensions.sql`) but no code in the API actually calls it.

The `employee_identifiers` table stores SSN, passport numbers, national IDs, and driver's licenses as `varchar(255)` in the `identifier_value` column. Based on the code evidence, these values are stored in plaintext despite the migration comment stating encryption is required.

This is a GDPR Article 32 risk: special-category personal data (national ID numbers are considered sensitive PII under UK GDPR) must be protected with appropriate technical measures including encryption at rest.

Remediation options:
1. Application-layer encryption before insert: encrypt `identifier_value` using AES-256-GCM with a key managed by a secrets manager (AWS KMS, HashiCorp Vault). Store the encrypted ciphertext in the column.
2. Database-layer encryption using pgcrypto: `pgp_sym_encrypt(value, encryption_key)` on insert, `pgp_sym_decrypt(identifier_value, encryption_key)` on select. The key must not be stored in the database.

### 10.2 Bank Account Details (Sort Code, Account Number)
**FAIL — HIGH**

`packages/api/src/modules/bank-details/repository.ts` stores `sort_code` and `account_number` as plain strings in the `employee_bank_details` table. No encryption is applied before insert (lines 226-228).

UK bank account details (sort code + account number) when combined with employee name constitute financial PII. Under the UK FCA's guidance and GDPR Article 32, financial data should have appropriate encryption at rest.

No `pgcrypto` calls, no AES encryption, no application-layer encryption found in the bank-details module.

Remediation: Same options as 10.1. Encrypt `sort_code` and `account_number` before insert; decrypt on read. The `account_name` (employee's name) should also be considered for encryption given it links financial data to an identity.

### 10.3 MFA TOTP Secret
**PASS**

`migrations/0092_better_auth_tables.sql` line 70 notes the TOTP secret column is marked as "(encrypted)" — BetterAuth handles TOTP secret encryption internally using the `BETTER_AUTH_SECRET`.

---

## Remediation Priority List

### CRITICAL — Fix Before Next Release

| ID | Issue | File | Fix |
|----|-------|------|-----|
| SEC-01 | Admin unlock endpoint accessible by any authenticated user | `packages/api/src/modules/auth/routes.ts:283` | Add `requirePermission("users", "admin")` to `beforeHandle` array |

### HIGH — Fix Within Sprint

| ID | Issue | Files | Fix |
|----|-------|-------|-----|
| SEC-02 | Bank details (sort code, account number) stored in plaintext | `packages/api/src/modules/bank-details/repository.ts` | Encrypt before insert using AES-256-GCM or pgcrypto |
| SEC-03 | Employee identifiers (SSN, passport, NI number) stored in plaintext despite migration comment requiring encryption | `packages/api/src/modules/hr/` (wherever identifier_value is written) | Implement application-layer encryption called out in migration 0021 |
| SEC-04 | `console.error()` used in production modules bypassing pino redaction | `auth/routes.ts`, `absence/service.ts`, `delegations/service.ts`, `benefits/routes.ts`, `security/routes.ts` | Replace with `logger.error(...)` from `../../lib/logger` |

### MEDIUM — Fix Within Quarter

| ID | Issue | File | Fix |
|----|-------|-------|-----|
| SEC-05 | `SESSION_SECRET` and `CSRF_SECRET` not individually required | `packages/api/src/config/secrets.ts` | Set `required: true` and validate both independently from `BETTER_AUTH_SECRET` |
| SEC-06 | `style-src 'unsafe-inline'` in default CSP | `packages/api/src/plugins/security-headers.ts:61` | Remove `'unsafe-inline'` or restrict to nonce-based allowlist |
| SEC-07 | `POSTGRES_PASSWORD` not validated at startup | `packages/api/src/config/secrets.ts` | Add validation for database password in production |
| SEC-08 | `bun audit` not confirmed in CI pipeline | `.github/workflows/security.yml` | Add dependency vulnerability scanning step |
| SEC-09 | Frontend `api-client.ts` CSRF token sending not verified | `packages/web/app/lib/api-client.ts` | Verify `X-CSRF-Token` header is sent on all mutating requests |

---

## Checklist Summary

| # | Area | Check | Status |
|---|------|--------|--------|
| 1.1 | Secrets | Startup validation rejects insecure secrets | PASS |
| 1.2 | Secrets | .env.example uses placeholder values | PASS |
| 1.3 | Secrets | .gitignore covers all .env files | PASS |
| 1.4 | Secrets | No hardcoded API keys or tokens in source | PASS |
| 1.5 | Secrets | SESSION_SECRET/CSRF_SECRET individually required | WARN |
| 2.1 | Input | TypeBox schemas on all sampled routes | PASS |
| 2.2 | Input | File upload type/size validation | PASS |
| 2.3 | Input | Request body size limit set (10 MB) | PASS |
| 3.1 | SQL | tx.unsafe() only on hardcoded column lists | PASS |
| 3.2 | SQL | All user data parameterized via tagged templates | PASS |
| 3.3 | SQL | No string-concatenated SQL | PASS |
| 4.1 | Auth | Session cookies httpOnly + secure (prod) + lax sameSite | PASS |
| 4.2 | Auth | requirePermission() on protected routes | PASS |
| 4.3 | Auth | RLS enabled, hris_app role has NOBYPASSRLS | PASS |
| 4.4 | Auth | Admin unlock endpoint has RBAC guard | FAIL — CRITICAL |
| 4.5 | Auth | Passwords hashed with bcrypt (12 rounds) | PASS |
| 5.1 | XSS | No dangerouslySetInnerHTML in frontend | PASS |
| 5.2 | XSS | CSP header present (style-src has unsafe-inline) | WARN |
| 5.3 | XSS | All other security headers set | PASS |
| 6.1 | CSRF | HMAC-SHA256 CSRF tokens with constant-time comparison | PASS |
| 6.2 | CSRF | Cookie SameSite=lax | PASS |
| 6.3 | CSRF | Frontend sends X-CSRF-Token | WARN (unverified) |
| 7.1 | Rate Limit | Auth endpoints have strict per-IP limits | PASS |
| 7.2 | Rate Limit | Rate limiting enabled by default in production | PASS |
| 7.3 | Rate Limit | Rate limit response headers present | PASS |
| 8.1 | Data | Audit plugin redacts sensitive fields | PASS |
| 8.2 | Data | Pino logger redacts passwords/tokens/secrets | PASS |
| 8.3 | Data | console.error() bypasses pino redaction in prod code | FAIL — HIGH |
| 8.4 | Data | Error responses omit stack traces in production | PASS |
| 9.1 | Deps | Lock file committed | PASS |
| 9.2 | Deps | Dependency audit in CI | WARN |
| 10.1 | Encryption | PII identifiers (SSN, passport) encrypted at rest | FAIL — HIGH |
| 10.2 | Encryption | Bank details (sort code, account number) encrypted | FAIL — HIGH |
| 10.3 | Encryption | MFA TOTP secret encrypted (BetterAuth-managed) | PASS |
