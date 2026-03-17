# Staffora HRIS -- Comprehensive Security Audit

**Project:** Staffora HRIS Platform
**Audit Date:** 2026-03-13
**Auditor:** Security & Data Protection Agent
**Scope:** Authentication, authorization, RLS, input validation, audit logging, secret management, GDPR, security headers, API security, dependencies
**Severity Scale:** CRITICAL > HIGH > MEDIUM > LOW > INFORMATIONAL

---

## 1. Executive Summary

**Overall Risk Level: MEDIUM**

The Staffora HRIS platform has a strong security foundation. Its use of PostgreSQL Row-Level Security (RLS) for tenant isolation, parameterized queries via postgres.js tagged templates to prevent SQL injection, Better Auth for session management, comprehensive RBAC with constraint evaluation, and a transactional outbox pattern for domain events are all well-implemented. The platform also features proper security headers (CSP, HSTS, X-Frame-Options), rate limiting with aggressive auth endpoint throttling, idempotency enforcement, and field-level permission controls.

However, the audit identified several findings requiring remediation, including a CSRF token validation gap, email verification being disabled, a hardcoded development database password, and missing GDPR data subject rights capabilities.

### Finding Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| Critical | 0 | None |
| High | 3 | CSRF validation gap, email verification disabled, no account lockout |
| Medium | 5 | Default dev password in source, minimum password length, no GDPR data export/erasure, no request body size limit, rate limiting disabled in tests |
| Low | 4 | Swagger docs exposed in dev, `unsafe()` in DB plugin, audit log for reads optional, session cookie SameSite Lax |
| Informational | 3 | No breached password check, no data retention automation, secrets validation only warns in dev |

**Security Score: 74 / 100**

---

## 2. Findings by Category

---

### A. Authentication System

#### HIGH-01: CSRF Token Presence Check Without Validation

**Severity:** HIGH
**Component:** `packages/api/src/plugins/auth-better.ts` (lines 513-529)

**Description:** The `requireCsrf()` guard checks that a `X-CSRF-Token` header is *present* on mutating requests, but never validates the token's value against any secret or server-side state. Any non-empty string will pass the check.

**Evidence:**
```typescript
export function requireCsrf() {
  return new Elysia({ name: "require-csrf" })
    .derive(({ request, set }) => {
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
        const csrfToken = request.headers.get("X-CSRF-Token");
        if (!csrfToken) {
          set.status = 403;
          throw new AuthError("CSRF_REQUIRED", "CSRF token is required for mutating requests", 403);
        }
      }
      return {};
    });
}
```
The `CSRF_SECRET` environment variable is defined in `.env.example` and validated by `secrets.ts`, but it is never used to sign or verify tokens.

**Impact:** An attacker who can craft cross-origin requests (e.g., via a compromised subdomain or a user clicking a malicious link) can supply any arbitrary CSRF header value and bypass the protection entirely. The SameSite=Lax cookie attribute provides partial mitigation for top-level navigations, but does not protect against same-site attacks or subdomains.

**Recommendation:**
1. Generate CSRF tokens server-side using `CSRF_SECRET` with HMAC-SHA256, bound to the user's session ID.
2. Validate the token on every mutating request by recomputing the HMAC and comparing.
3. Consider the Double Submit Cookie pattern or Synchronizer Token pattern.

---

#### HIGH-02: Email Verification Disabled

**Severity:** HIGH
**Component:** `packages/api/src/lib/better-auth.ts` (line 250)

**Description:** Better Auth is configured with `requireEmailVerification: false`. Users can access all platform features immediately after registration without proving email ownership.

**Evidence:**
```typescript
emailAndPassword: {
  enabled: true,
  minPasswordLength: 8,
  maxPasswordLength: 128,
  requireEmailVerification: false,
  // ...
}
```

**Impact:** Attackers can register with arbitrary email addresses (including addresses belonging to other employees), potentially gaining access to tenant data through social engineering or by exploiting invitation flows. For an enterprise HRIS handling sensitive employee data, this is a significant risk.

**Recommendation:**
1. Set `requireEmailVerification: true` in production.
2. Implement a verification email flow with time-limited tokens.
3. Block access to tenant-scoped data until email is verified.

---

#### HIGH-03: No Account Lockout Mechanism

**Severity:** HIGH
**Component:** `packages/api/src/plugins/rate-limit.ts`, `packages/api/src/lib/better-auth.ts`

**Description:** While rate limiting exists for auth endpoints (5 login attempts per 60 seconds per IP), there is no account-level lockout after repeated failed login attempts. The rate limit is IP-based only, so an attacker using multiple IPs (botnets, proxy rotation) can perform unlimited password attempts against a single account.

**Evidence:** The rate limit configuration (lines 24-29) only throttles by IP:
```typescript
{ pattern: /^\/api\/auth\/sign-in/, maxRequests: 5, windowSeconds: 60 },
```
There is an `ACCOUNT_LOCKED` error code defined in `packages/shared/src/errors/messages.ts`, but no code implements the actual lockout logic.

**Impact:** Credential stuffing and brute-force attacks against specific user accounts are not adequately prevented.

**Recommendation:**
1. Implement account-level lockout: lock account after 10 failed attempts.
2. Track failed login attempts per account in the database.
3. Implement exponential backoff or CAPTCHA after 3 failed attempts.
4. Send notification to the user on lockout.

---

### B. Authorization / RBAC

#### INFORMATIONAL-01: RBAC System Is Well-Implemented

**Severity:** INFORMATIONAL (positive finding)

**Description:** The RBAC system in `packages/api/src/plugins/rbac.ts` is thoroughly implemented with:
- Permission checking via database functions (`get_user_roles`, `get_user_permissions`)
- Cached permissions with TTL
- Constraint evaluation (org unit, cost center, relationship scope)
- MFA requirement per permission
- Super admin and tenant admin role detection
- Wildcard permission support
- `requirePermission()`, `requireAnyPermission()`, `requireAllPermissions()` guards

**Evidence:** All module routes use `beforeHandle: [requirePermission("resource", "action")]` guards. The HR module (gold standard) has 28+ permission checks across its routes.

---

#### INFORMATIONAL-02: Field-Level Permissions Implemented

**Severity:** INFORMATIONAL (positive finding)

**Description:** `packages/api/src/modules/security/field-permission.service.ts` provides field-level access control per role, including:
- Field registry with sensitivity markers
- Per-role field permission overrides (hidden/view/edit)
- Response filtering (removes hidden fields from API responses)
- Edit validation (prevents updates to non-editable fields)
- Most-permissive-wins across roles

---

### C. Row-Level Security

#### INFORMATIONAL-03: RLS Is Comprehensive and Well-Enforced

**Severity:** INFORMATIONAL (positive finding)

**Description:** Every tenant-owned table has RLS enabled with consistent policies. The pattern is applied across 40+ tables verified in migration files.

**Evidence (from `migrations/0017_employees.sql`):**
```sql
ALTER TABLE app.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.employees
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );

CREATE POLICY tenant_isolation_insert ON app.employees
    FOR INSERT
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR app.is_system_context()
    );
```

The application role (`hris_app`) has `NOBYPASSRLS`, and tests run under this role to verify RLS enforcement. The `withTransaction()` method always sets tenant context via `app.set_tenant_context()`, and system-level operations use `withSystemContext()` which is properly scoped.

---

#### LOW-01: `unsafe()` Used for SET TRANSACTION in DB Plugin

**Severity:** LOW
**Component:** `packages/api/src/plugins/db.ts` (lines 211-217)

**Description:** The `withTransaction()` method uses `tx.unsafe()` for `SET TRANSACTION ISOLATION LEVEL` and `SET TRANSACTION` access mode. While the values come from a constrained TypeScript type (`"read committed" | "repeatable read" | "serializable"`), the `toUpperCase()` call processes the string dynamically.

**Evidence:**
```typescript
if (isolationLevel) {
  await tx.unsafe(
    `SET TRANSACTION ISOLATION LEVEL ${isolationLevel.toUpperCase()}`
  );
}
```

**Impact:** Very low risk because the `isolationLevel` parameter is constrained by TypeScript types and never derived from user input. However, this pattern could become dangerous if the function signature is relaxed in future changes.

**Recommendation:** Use tagged template literals or a switch/case mapping to avoid `unsafe()` entirely:
```typescript
const levels = {
  "read committed": sql`SET TRANSACTION ISOLATION LEVEL READ COMMITTED`,
  "repeatable read": sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`,
  "serializable": sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`,
};
```

---

### D. Input Validation

#### INFORMATIONAL: SQL Injection Prevention Is Strong

**Severity:** INFORMATIONAL (positive finding)

**Description:** All database queries in module services and repositories use postgres.js tagged templates, which automatically parameterize values. No string concatenation or interpolation was found in production query code. The `db.query` method in modules has zero occurrences -- all tenant-scoped queries go through `db.withTransaction()`.

**Evidence from grep:** Zero matches for `db.query\`` in `packages/api/src/modules/` directory. All queries use tagged templates:
```typescript
const rows = await tx`SELECT * FROM employees WHERE id = ${id}`;
```

The only uses of `tx.unsafe()` are in:
- Migration runner (expected -- runs raw SQL migration files)
- `SET TRANSACTION` commands (constrained types)
- Test setup code (grants, schema creation)

---

#### MEDIUM-01: No Request Body Size Limit

**Severity:** MEDIUM
**Component:** `packages/api/src/app.ts`

**Description:** The Elysia application does not configure a maximum request body size. By default, Bun/Elysia may accept very large request bodies, enabling potential denial-of-service through memory exhaustion.

**Evidence:** Grep for `bodyLimit`, `maxBodySize`, `body.*limit` in the API source returned zero matches.

**Impact:** An attacker could send extremely large POST/PUT requests to exhaust server memory.

**Recommendation:** Configure a body size limit in the Elysia app:
```typescript
app.onParse({ as: 'global' }, async ({ request }) => {
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 10_000_000) { // 10MB
    throw new Error('Request body too large');
  }
});
```

---

### E. Audit Logging

#### LOW-02: Audit Logging for Read Operations Is Optional

**Severity:** LOW
**Component:** `packages/api/src/plugins/audit.ts`

**Description:** The audit system supports logging read operations (`AuditActions.EMPLOYEE_VIEWED`, `REPORT_GENERATED`), but invocation is left to individual route handlers. There is no automatic audit trail for data access, only for mutations.

**Evidence:** The `auditPlugin()` provides an `audit.log()` helper on the request context, but it must be called explicitly. No `onAfterHandle` hook automatically logs read access to sensitive resources.

**Impact:** For GDPR compliance (Article 30 -- Records of Processing Activities), access to personal data should be logged. Without automatic read auditing, it may be difficult to demonstrate compliance with data access logging requirements.

**Recommendation:**
1. Add automatic audit logging for read operations on sensitive entities (employees, compensation, personal data).
2. Consider an `onAfterHandle` hook that logs access based on route patterns.

---

#### Audit System Positive Findings

The audit system properly:
- Captures before/after values for mutations via `compareObjects()`
- Sanitizes sensitive fields (password, token, secret, api_key) via `sanitizeAuditData()`
- Records IP address, user agent, session ID, and request ID
- Writes to an append-only `audit_log` table with system context
- Supports in-transaction logging via `logInTransaction()`
- Provides resource and user audit trail queries

---

### F. Secret Management

#### MEDIUM-02: Hardcoded Development Database Password in Source Code

**Severity:** MEDIUM
**Component:** `packages/api/src/config/database.ts` (line 34), `packages/api/src/plugins/db.ts` (line 67)

**Description:** The default development database password `hris_dev_password` is hardcoded in source code as a fallback when environment variables are not set.

**Evidence:**
```typescript
// database.ts
export const DEFAULT_DB_PASSWORD = "hris_dev_password";

// db.ts
password: process.env["DB_PASSWORD"] || "hris_dev_password",
```

**Impact:** If a production deployment fails to set `DB_PASSWORD` or `DATABASE_URL`, the application will attempt to connect using the development password. The `.env.example` also contains this same password. While `.env` files are properly gitignored, the defaults in source code could facilitate a connection if a production database accidentally has the same password.

**Recommendation:**
1. Remove hardcoded password fallbacks from production code.
2. Crash the application on startup if `DATABASE_URL` or `DB_PASSWORD` is not set in production mode.
3. The existing `validateSecrets()` function should be extended to also validate database credentials.

---

#### Secret Validation Positive Findings

The `packages/api/src/config/secrets.ts` module provides:
- Validation of `BETTER_AUTH_SECRET` (required, 32+ chars)
- Detection of insecure default values (10+ known patterns)
- Production crash on missing/weak secrets
- Development warnings for weak secrets
- `.env` properly gitignored (`.gitignore` lines 37-48)

---

### G. Data Protection (GDPR)

#### MEDIUM-03: No Data Subject Access Request (SAR) Capability

**Severity:** MEDIUM
**Component:** System-wide

**Description:** The platform has no endpoint or mechanism to export all personal data for a specific individual (GDPR Article 15 -- Right of Access). While audit trail queries exist for resource and user data, there is no comprehensive "export all my data" feature.

**Evidence:** Grep for `data.?export`, `subject.?access`, `right.?to.?erasure`, `gdpr`, `anonymi[sz]e` found no implementation in the API modules. References exist only in audit documentation.

**Impact:** GDPR requires that data subjects can request a copy of all their personal data within 30 days. Without this capability, the platform cannot comply with Article 15.

**Recommendation:**
1. Implement a SAR endpoint that aggregates all personal data across modules (employees, contacts, addresses, identifiers, compensation, leave, performance, documents).
2. Export as structured JSON or CSV.
3. Log SAR requests in the audit trail.

---

#### MEDIUM-04: No Right to Erasure (Data Deletion) Capability

**Severity:** MEDIUM
**Component:** System-wide

**Description:** The platform has no mechanism for data anonymization or erasure to comply with GDPR Article 17 (Right to Erasure). Employee records can be soft-deleted (terminated status), but personal data remains intact.

**Evidence:** No anonymization functions, data purging routines, or erasure endpoints were found in the codebase.

**Impact:** GDPR requires the ability to erase personal data when it is no longer needed for the original processing purpose. Post-employment retention periods vary by jurisdiction but must be followed.

**Recommendation:**
1. Implement a data anonymization function that replaces PII with anonymized values.
2. Create a scheduled job for automatic anonymization after configurable retention periods.
3. Support manual erasure requests with proper authorization (requires tenant_admin role).
4. Maintain audit records of erasure operations.

---

#### INFORMATIONAL-04: No Automated Data Retention Policy

**Severity:** INFORMATIONAL
**Component:** System-wide

**Description:** While idempotency keys have a 24-48 hour TTL and are cleaned up automatically, there is no configurable data retention policy for business data (terminated employees, resolved cases, completed onboarding). Retention is currently indefinite.

**Recommendation:** Implement configurable per-tenant retention policies with automated archival or anonymization.

---

### H. Security Headers

#### Security Headers: STRONG (Positive Finding)

The `packages/api/src/plugins/security-headers.ts` implements comprehensive security headers:

| Header | Value | Assessment |
|--------|-------|------------|
| X-Content-Type-Options | `nosniff` | Correct |
| X-Frame-Options | `DENY` | Correct |
| X-XSS-Protection | `1; mode=block` | Present (legacy, harmless) |
| Referrer-Policy | `strict-origin-when-cross-origin` | Correct |
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline'; ...` | Good (see note) |
| Permissions-Policy | Disables camera, mic, geolocation, payment, FLoC | Correct |
| Strict-Transport-Security | Enabled in production (1 year, includeSubDomains) | Correct |
| X-Download-Options | `noopen` | Correct |
| X-Permitted-Cross-Domain-Policies | `none` | Correct |
| Cross-Origin-Opener-Policy | `same-origin` | Correct |
| Cross-Origin-Resource-Policy | `same-origin` | Correct |

**Note:** CSP includes `'unsafe-inline'` for `script-src` and `style-src` to support Swagger UI. This is acceptable since Swagger is disabled in production (`config.isProduction` check in `app.ts` line 146).

---

### I. CORS Configuration

The CORS configuration in `app.ts` is properly implemented:
- **Production:** Strict origin whitelist from `CORS_ORIGIN` env var
- **Development:** Allows localhost/127.0.0.1 with any port (regex validated)
- **Credentials:** Enabled (`credentials: true`)
- **Allowed Headers:** Explicitly listed (Content-Type, Authorization, X-CSRF-Token, X-Tenant-ID, Idempotency-Key, etc.)
- **Preflight caching:** 24h in production, 10min in dev
- **Trusted Origins:** Better Auth's `trustedOrigins` are synced with CORS config

---

### J. Rate Limiting

#### MEDIUM-05: Rate Limiting Disabled During Tests

**Severity:** MEDIUM
**Component:** `packages/api/src/plugins/rate-limit.ts` (lines 88-96)

**Description:** Rate limiting is automatically disabled when `NODE_ENV=test`, `BUN_TEST=true`, or `test` is in `process.argv`. While this is common practice, it means rate limiting behavior is never verified in the test suite.

**Evidence:**
```typescript
const isTestRun =
  process.env["NODE_ENV"] === "test" ||
  process.env["BUN_TEST"] === "true" ||
  process.argv.includes("test");

const enabled =
  typeof options.enabled === "boolean"
    ? options.enabled
    : !isTestRun && process.env["FEATURE_RATE_LIMIT_ENABLED"] !== "false";
```

**Impact:** Rate limiting bugs would not be caught by automated tests.

**Recommendation:** Add dedicated rate limiting integration tests that explicitly enable rate limiting via `options.enabled: true`.

---

#### Rate Limiting Positive Findings

- Auth endpoints have aggressive limits: 5 sign-in, 3 sign-up, 3 forgot-password per minute per IP
- Generic rate limiting: 100 requests/minute per tenant+user+endpoint
- Trusted proxy support with configurable `TRUSTED_PROXIES` env var
- Proper IP extraction (rightmost untrusted IP in X-Forwarded-For chain)
- RateLimit response headers (X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After)

---

### K. API Security

#### Idempotency: STRONG (Positive Finding)

The idempotency plugin (`packages/api/src/plugins/idempotency.ts`) is well-implemented:
- Required `Idempotency-Key` header on all POST/PUT/PATCH/DELETE requests
- Scoped by tenant + user + route
- Request body hashing for mismatch detection
- Database-backed with Redis cache
- Concurrent request locking (30-second timeout)
- Automatic cleanup of expired keys
- 48-hour default TTL

#### Auth Guard Coverage: STRONG

All API module routes verified to have `beforeHandle` guards:
- HR routes: 28+ `requirePermission()` checks
- Portal routes: `requireAuthContext` + `requireTenantContext` on all endpoints
- Dashboard routes: `requirePermission("dashboards", "read")`
- System routes: `requirePermission("dashboards", "read")`
- Security routes: `requireAuthContext` and `requirePermission()` on mutations
- Auth routes: `requireAuthContext` on all tenant-switching and user-info endpoints

#### LOW-03: Swagger Documentation Exposed in Development

**Severity:** LOW
**Component:** `packages/api/src/app.ts` (lines 144-173)

**Description:** Swagger documentation at `/docs` is enabled in development mode and properly disabled in production. This is correct behavior but worth noting.

**Evidence:** `config.isProduction ? new Elysia({ name: "swagger-disabled" }) : swagger({...})`

---

#### LOW-04: Session Cookie SameSite=Lax Instead of Strict

**Severity:** LOW
**Component:** `packages/api/src/lib/better-auth.ts` (line 283)

**Description:** Session cookies use `sameSite: "lax"` which allows cookies to be sent on top-level navigations from external sites (e.g., clicking a link from an email). While `"strict"` would provide stronger CSRF protection, `"lax"` is a pragmatic choice for usability (allows session preservation when navigating from external links).

**Evidence:**
```typescript
defaultCookieAttributes: {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env["NODE_ENV"] === "production",
},
```

**Impact:** Low, since the primary CSRF defense should be token-based (see HIGH-01). SameSite=Lax still prevents cookies from being sent on cross-origin POST/PUT/PATCH/DELETE requests from third-party sites.

---

### L. Password Policy

#### MEDIUM-06: Minimum Password Length Below Enterprise Standard

**Severity:** MEDIUM
**Component:** `packages/api/src/lib/better-auth.ts` (line 248)

**Description:** The minimum password length is set to 8 characters. NIST SP 800-63B recommends at least 8 characters as an absolute minimum but suggests 15+ for enterprise systems. The `isStrongPassword()` utility in shared code requires uppercase, lowercase, number, and special character, but Better Auth does not invoke this function during registration.

**Evidence:**
```typescript
minPasswordLength: 8,
maxPasswordLength: 128,
```

The shared `isStrongPassword()` function exists but is not wired into the Better Auth password hash flow.

**Impact:** Weak passwords increase risk of brute-force and credential stuffing attacks.

**Recommendation:**
1. Increase minimum password length to 12 characters.
2. Wire `isStrongPassword()` into the Better Auth `password.hash` flow to enforce complexity requirements.
3. Consider implementing a breached password check (HaveIBeenPwned k-anonymity API).

---

### M. Dependency Security

#### INFORMATIONAL-05: Secrets Validation Only Warns in Development

**Severity:** INFORMATIONAL
**Component:** `packages/api/src/config/secrets.ts`

**Description:** The `validateSecrets()` function only crashes the process in production (`NODE_ENV=production`). In development, weak or default secrets produce console warnings only. This is by design for developer experience but means development environments run with known-weak secrets.

**Impact:** Minimal -- development environments should not contain sensitive data.

---

## 3. Security Score

| Category | Max Points | Score | Notes |
|----------|-----------|-------|-------|
| Authentication | 15 | 10 | CSRF gap (-3), no email verification (-2) |
| Authorization / RBAC | 15 | 15 | Comprehensive, field-level support |
| Row-Level Security | 15 | 15 | Excellent -- 40+ tables, tested |
| Input Validation | 10 | 9 | Strong SQL injection prevention, no body size limit (-1) |
| Audit Logging | 10 | 8 | Comprehensive for writes, optional for reads (-2) |
| Secret Management | 10 | 8 | Good validation, hardcoded dev defaults (-2) |
| Data Protection (GDPR) | 10 | 3 | No SAR, no erasure, no retention (-7) |
| Security Headers | 5 | 5 | Complete |
| API Security | 5 | 5 | Idempotency, auth guards, rate limiting |
| Dependencies & Config | 5 | 4 | No account lockout (-1) |

**Total: 82 / 100** (adjusted from component scores with cross-cutting impact consideration)

**Final Score: 74 / 100** (deducted 8 points for GDPR gaps, which are weighty for an HRIS handling employee PII in the UK)

---

## 4. Prioritized Remediation Plan

### Phase 1: Before Production (Critical Path) -- Target: 2 weeks

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | **HIGH-01:** Implement proper CSRF token validation with HMAC signing | 2 days | Closes CSRF attack vector |
| 2 | **HIGH-02:** Enable email verification for production | 1 day | Prevents account impersonation |
| 3 | **HIGH-03:** Implement account lockout after failed attempts | 2 days | Prevents credential brute-force |
| 4 | **MEDIUM-01:** Add request body size limit | 0.5 days | Prevents memory DoS |
| 5 | **MEDIUM-02:** Remove hardcoded database password fallback in production | 0.5 days | Prevents insecure default connection |

### Phase 2: Short-Term (1 month)

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 6 | **MEDIUM-06:** Increase minimum password length to 12+ | 0.5 days | Stronger passwords |
| 7 | **MEDIUM-05:** Add rate limiting integration tests | 1 day | Verifies rate limiting behavior |
| 8 | **LOW-01:** Replace `unsafe()` calls with parameterized alternatives | 0.5 days | Defense in depth |
| 9 | **LOW-02:** Add automatic read audit logging for sensitive entities | 2 days | GDPR compliance (Article 30) |

### Phase 3: GDPR Compliance (2-3 months)

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 10 | **MEDIUM-03:** Implement Subject Access Request endpoint | 5 days | GDPR Article 15 compliance |
| 11 | **MEDIUM-04:** Implement data erasure / anonymization | 5 days | GDPR Article 17 compliance |
| 12 | **INFO-04:** Implement configurable data retention policies | 3 days | GDPR Article 5(1)(e) compliance |
| 13 | Add breached password check (HaveIBeenPwned API) | 1 day | Prevents known-compromised passwords |

---

## 5. Positive Security Patterns (What Is Done Well)

1. **RLS is non-negotiable**: Every tenant-scoped table has RLS with consistent policies. The application role (`hris_app`) cannot bypass RLS. Tests verify isolation.

2. **Parameterized queries everywhere**: Zero string interpolation in SQL queries. All queries use postgres.js tagged templates which auto-parameterize.

3. **Transactional outbox pattern**: Domain events are written atomically with business data in the same transaction, preventing event loss.

4. **Comprehensive RBAC**: Permission guards on every route, constraint evaluation, MFA-per-permission, super admin detection, cached permissions.

5. **Field-level security**: Role-based field visibility (hidden/view/edit) with response filtering.

6. **Secret validation at startup**: Production deployments crash if secrets are missing, too short, or match known insecure defaults.

7. **Security headers**: Complete set of modern security headers including CSP, CORP, COOP, HSTS, Permissions-Policy.

8. **Rate limiting with auth-specific thresholds**: Aggressive limits on authentication endpoints (5 login/min, 3 signup/min).

9. **Idempotency enforcement**: All mutating endpoints require idempotency keys, scoped by tenant+user+route, with duplicate detection.

10. **Audit trail with data sanitization**: Sensitive fields (passwords, tokens, secrets) are automatically redacted from audit logs.

11. **Better Auth MFA support**: TOTP-based 2FA with proper enforcement at login time.

12. **Cookie security**: HttpOnly, Secure (in production), SameSite=Lax, prefixed cookies.

---

*End of Security Audit Report*

---

## Related Documents

- [Final System Report](FINAL_SYSTEM_REPORT.md) — Consolidated audit report with all scores
- [Security Patterns](../patterns/SECURITY.md) — RLS, authentication, and authorization patterns
- [Permissions System](../architecture/PERMISSIONS_SYSTEM.md) — 7-layer permission architecture
- [Database Guide](../architecture/DATABASE.md) — RLS policies and tenant isolation
- [Production Checklist](../operations/production-checklist.md) — Security items in pre-launch checklist
- [Risk Register](../project-management/risk-register.md) — Security risks and mitigations
- [Sprint Plan Phase 1](../project-management/sprint-plan-phase1.md) — Security hardening sprint
