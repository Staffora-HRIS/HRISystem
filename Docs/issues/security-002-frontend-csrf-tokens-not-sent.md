# [SECURITY] Frontend API Client Does Not Send CSRF Tokens

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

**Priority:** CRITICAL
**Labels:** bug, security
**Effort:** SMALL

## Description
The frontend API client at `packages/web/app/lib/api-client.ts` never sends a CSRF token. The `buildHeaders()` method only injects `Content-Type`, `Accept`, and `X-Tenant-ID`. A search for "csrf" or "CSRF" across the entire `packages/web/app` directory returns zero results. This means every POST/PUT/PATCH/DELETE request from the frontend will receive a 403 CSRF error in production, rendering all mutations inoperable.

## Current State
- `packages/web/app/lib/api-client.ts` `buildHeaders()` (lines 266-291): no CSRF header
- Zero references to CSRF anywhere in the frontend codebase
- Backend requires `X-CSRF-Token` header via `requireCsrf()` guard

## Expected State
- Frontend fetches CSRF token from `/api/auth/csrf` on session initialization
- `X-CSRF-Token` header included in all mutating requests
- Token refreshed automatically on expiry or session change

## Acceptance Criteria
- [ ] CSRF token fetched from backend on authentication
- [ ] `X-CSRF-Token` header added to all POST/PUT/PATCH/DELETE requests in `buildHeaders()`
- [ ] Token cached and refreshed on session change
- [ ] Integration test verifies CSRF tokens flow end-to-end

## Implementation Notes
Add a `getCsrfToken()` method to the API client. Fetch from `/api/auth/csrf`, cache in memory, inject into `buildHeaders()`. Consider using a React context provider for token management.

## Affected Files
- `packages/web/app/lib/api-client.ts`
- `packages/web/app/lib/auth.ts`

## Related Issues
- security-001-csrf-token-validation
