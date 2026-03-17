# ADR-001: Use Better Auth for Authentication

**Status:** Accepted
**Date:** 2026-01-07
**Authors:** Platform team

## Context

The Staffora HRIS platform requires a robust authentication system supporting:

- Session-based authentication with secure cookies (not JWT, since the frontend is server-rendered and co-located with the API)
- Multi-factor authentication (TOTP)
- Email/password credential management with configurable password policies
- Multi-tenant user management
- Account lockout after failed login attempts
- CSRF protection integrated with the session layer

We needed to choose between building a custom authentication layer from scratch, adopting an external identity provider (Auth0, Clerk, etc.), or using an open-source authentication library that integrates directly into the application.

Key constraints:

- **UK data residency**: As a UK HRIS handling sensitive employee data, we must control where authentication data is stored. External SaaS providers introduce GDPR data transfer concerns.
- **Customisation depth**: HR systems require unusual auth flows (tenant switching, employee-linked accounts, admin unlocking).
- **Cost**: SaaS auth providers charge per-user, which becomes expensive at enterprise scale.
- **Self-hosted**: The platform must be deployable on-premises or in private cloud without external dependencies.

## Decision

We adopt **Better Auth** (https://better-auth.com/) as the sole authentication system for the Staffora platform. All authentication, session management, and credential handling flows through Better Auth's API and database tables.

Specifically:

- Better Auth manages its own tables (`app."user"`, `app."session"`, `app."account"`, `app."verification"`, `app."twoFactor"`) using camelCase text IDs.
- Sessions are cookie-based with 7-day expiry and 5-minute cookie cache.
- Passwords use bcrypt (for legacy hash compatibility) and scrypt (Better Auth default for new users).
- Two-factor authentication is provided by the `twoFactor` plugin (TOTP, 6-digit, 30-second period).
- The `organization` plugin provides multi-tenant organization support.
- Better Auth routes are mounted at `/api/auth/*` via the `betterAuthPlugin` in the Elysia plugin chain.
- Custom `databaseHooks` keep a legacy `app.users` table synchronised (see ADR-005).
- A custom `password.verify` function handles both bcrypt and scrypt hashes since Better Auth does not fall back to its default verifier when a custom function is provided.
- Account lockout is enforced via `databaseHooks.session.create.before`, calling `app.check_account_lockout()` before session creation.
- Secure cookie configuration uses the `staffora` prefix, `httpOnly`, `sameSite=strict` in production, and `secure` in production.

## Consequences

### Positive

- **Full data sovereignty**: All auth data lives in our PostgreSQL database in the `app` schema, satisfying UK GDPR data residency requirements.
- **No per-user SaaS cost**: Better Auth is open-source and self-hosted.
- **Deep customisation**: Database hooks let us enforce account lockout, sync legacy tables, and add custom session fields (e.g., `currentTenantId`).
- **Session-based security**: Cookie sessions with CSRF protection are more secure for server-rendered apps than bearer tokens.
- **Integrated MFA**: TOTP support is built in via the plugin system.
- **Actively maintained**: Better Auth is under active development with a growing community.

### Negative

- **Coupling to Better Auth's schema**: Better Auth manages its own table structure and column naming (camelCase), which differs from our snake_case convention. This creates a dual-table architecture (see ADR-005).
- **Custom verify gotcha**: When providing a custom `password.verify`, Better Auth does NOT fall back to its default scrypt verifier. Our code must explicitly handle both hash formats, and this is a subtle source of bugs.
- **Database hooks are not triggered by raw SQL**: Direct SQL inserts into `app."user"` bypass `databaseHooks`, requiring manual synchronisation of `app.users`. This must be documented and enforced in code review.
- **Library maturity**: Better Auth is newer than established solutions like Passport.js or Auth.js. Breaking changes in major versions are possible.

### Neutral

- The `pg` Pool used by Better Auth is separate from the `postgres.js` client used by the rest of the application. This means two connection pools exist at runtime.
- Better Auth generates text IDs by default; we override this with `crypto.randomUUID()` to maintain UUID consistency across the system.

## Alternatives Considered

### Auth0 / Clerk / WorkOS (External SaaS)

Rejected because:
- Per-user pricing is prohibitive at enterprise HRIS scale (thousands of employees per tenant)
- UK data residency cannot be guaranteed for all features
- Limited customisation for HR-specific flows (tenant switching, employee-account linking)
- Introduces external runtime dependency for a self-hosted product

### Passport.js / Custom auth middleware

Rejected because:
- Passport.js is a strategy aggregator, not a complete auth solution; we would still need to build session management, MFA, account lockout, and CSRF ourselves
- Higher maintenance burden for security-critical code
- No built-in database adapter or migration system

### Lucia Auth

Considered but rejected because:
- Lucia was deprecated by its author in early 2025 in favour of recommending libraries like Better Auth
- Better Auth has a more complete feature set (MFA, organization support, database hooks)

## References

- Better Auth documentation: https://better-auth.com/
- Implementation: `packages/api/src/lib/better-auth.ts`
- Auth plugin: `packages/api/src/plugins/auth-better.ts`
- Auth routes: `packages/api/src/modules/auth/routes.ts`
- Account lockout migration: `migrations/0131_account_lockout.sql`
