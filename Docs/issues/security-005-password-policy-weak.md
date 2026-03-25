# [SECURITY] Minimum Password Length Below Enterprise Standard

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

**Priority:** MEDIUM
**Labels:** security, enhancement
**Effort:** SMALL

## Description
The minimum password length is set to 8 characters. NIST SP 800-63B recommends 15+ for enterprise systems. The `isStrongPassword()` utility in the shared package enforces complexity requirements (uppercase, lowercase, number, special character), but Better Auth does not invoke this function during registration.

## Current State
- `packages/api/src/lib/better-auth.ts` (line 248): `minPasswordLength: 8`
- `packages/shared/src/utils/validation.ts`: `isStrongPassword()` exists but is not wired into auth flow
- No breached password check (HaveIBeenPwned)

## Expected State
- Minimum password length of 12 characters
- `isStrongPassword()` wired into Better Auth's password validation
- Optional breached password check via HaveIBeenPwned k-anonymity API

## Acceptance Criteria
- [ ] Minimum password length increased to 12 characters
- [ ] `isStrongPassword()` enforced during registration and password change
- [ ] Clear error messages for password policy violations
- [ ] Existing users prompted to update weak passwords on next login

## Implementation Notes
Wire `isStrongPassword()` into Better Auth's `password.hash` flow as a pre-validation step. Consider implementing HaveIBeenPwned k-anonymity API check as a follow-up.

## Affected Files
- `packages/api/src/lib/better-auth.ts`
- `packages/shared/src/utils/validation.ts`

## Related Issues
- security-004-account-lockout-missing
