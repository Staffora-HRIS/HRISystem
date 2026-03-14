# [SECURITY] No Account Lockout Mechanism After Failed Login Attempts

**Priority:** HIGH
**Labels:** bug, security
**Effort:** MEDIUM

## Description
While IP-based rate limiting exists for auth endpoints (5 login attempts per 60 seconds), there is no account-level lockout after repeated failed login attempts. An attacker using multiple IPs (botnets, proxy rotation) can perform unlimited password attempts against a single account. An `ACCOUNT_LOCKED` error code is defined in shared error messages but no lockout logic is implemented.

## Current State
- `packages/api/src/plugins/rate-limit.ts` (lines 24-29): IP-based rate limiting only
- `packages/shared/src/errors/messages.ts`: `ACCOUNT_LOCKED` error code defined but unused
- No failed login attempt tracking per account
- No lockout/unlock mechanism

## Expected State
- Account locked after 10 consecutive failed login attempts
- Failed login attempts tracked per account in database
- Exponential backoff or CAPTCHA after 3 failed attempts
- User notified of lockout via email
- Admin unlock capability

## Acceptance Criteria
- [ ] Failed login attempts tracked per user account in database
- [ ] Account locked after configurable threshold (default: 10 attempts)
- [ ] Locked account returns `ACCOUNT_LOCKED` error with appropriate message
- [ ] Lockout notification sent to user's verified email
- [ ] Admin can unlock accounts via management UI
- [ ] Auto-unlock after configurable cooldown period (default: 30 minutes)
- [ ] Integration test verifies lockout behavior

## Implementation Notes
Add a `failed_login_attempts` counter and `locked_until` timestamp to the user record. Use Better Auth's `onError` hook to track failures. Clear counter on successful login.

## Affected Files
- `packages/api/src/lib/better-auth.ts`
- `packages/api/src/plugins/rate-limit.ts`
- `packages/shared/src/errors/messages.ts`

## Related Issues
- security-003-email-verification-disabled
- security-005-password-policy-weak
