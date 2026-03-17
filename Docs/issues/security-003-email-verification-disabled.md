# [SECURITY] Email Verification Disabled in Better Auth

**Priority:** HIGH
**Labels:** bug, security
**Effort:** SMALL

## Description
Better Auth is configured with `requireEmailVerification: false`. Users can access all platform features immediately after registration without proving email ownership. For an enterprise HRIS handling sensitive employee data, this allows registration with arbitrary email addresses, potentially enabling account impersonation through social engineering or invitation flow exploitation.

## Current State
- `packages/api/src/lib/better-auth.ts` (line 250): `requireEmailVerification: false`
- No verification email flow implemented
- Users have full access immediately after registration

## Expected State
- Email verification required before accessing tenant-scoped data
- Verification email sent on registration with time-limited token
- Unverified accounts blocked from sensitive operations

## Acceptance Criteria
- [ ] `requireEmailVerification: true` in production configuration
- [ ] Verification email sent with time-limited token on registration
- [ ] Unverified users cannot access tenant-scoped data
- [ ] Verification status visible in user management UI
- [ ] Re-send verification email endpoint available

## Implementation Notes
Better Auth supports email verification natively. Set `requireEmailVerification: true` and configure the email transport in the notification worker. Add a middleware check that blocks unverified users from tenant endpoints.

## Affected Files
- `packages/api/src/lib/better-auth.ts`
- `packages/api/src/jobs/notification-worker.ts`
- `packages/api/src/plugins/auth-better.ts`

## Related Issues
- security-004-account-lockout-missing
