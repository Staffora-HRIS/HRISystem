# [SECURITY] CSRF Token Validation Not Implemented

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

*Last updated: 2026-03-28*

**Priority:** CRITICAL
**Labels:** bug, security
**Effort:** MEDIUM

## Description
The `requireCsrf()` guard in the auth plugin checks that an `X-CSRF-Token` header is *present* on mutating requests, but never validates the token's value against any secret or server-side state. Any non-empty string passes the check. The `CSRF_SECRET` environment variable is defined and validated at startup but is never used to sign or verify tokens.

## Current State
- `packages/api/src/plugins/auth-better.ts` (lines 513-529): checks for header presence only
- `packages/api/src/config/secrets.ts`: validates `CSRF_SECRET` exists but it is unused
- SameSite=Lax cookie provides partial mitigation but does not protect against same-site attacks

## Expected State
- CSRF tokens generated server-side using HMAC-SHA256 with `CSRF_SECRET`, bound to the user's session ID
- Every mutating request validated by recomputing the HMAC and comparing
- Double Submit Cookie pattern or Synchronizer Token pattern implemented

## Acceptance Criteria
- [ ] CSRF tokens are generated server-side and bound to the user session
- [ ] `requireCsrf()` validates the token value, not just its presence
- [ ] `CSRF_SECRET` is used in token generation/validation
- [ ] Invalid or missing tokens return 403 with clear error message
- [ ] Integration tests verify CSRF validation end-to-end

## Implementation Notes
Use HMAC-SHA256 with session ID as payload. Generate token on session creation, expose via `/api/auth/csrf` endpoint. Validate on every POST/PUT/PATCH/DELETE.

## Affected Files
- `packages/api/src/plugins/auth-better.ts`
- `packages/api/src/config/secrets.ts`
- `packages/api/src/lib/better-auth.ts`

## Related Issues
- security-002-frontend-csrf-tokens-not-sent
