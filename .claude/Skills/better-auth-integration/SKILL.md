---
name: better-auth-integration
description: Implement authentication using Better Auth. Use when working on login, registration, sessions, tenant switching, or auth-related code.
---

# Better Auth Integration

## Key Files
- `packages/api/src/plugins/auth-better.ts` - Better Auth config
- `packages/api/src/modules/auth/` - Auth module
- `packages/web/app/lib/auth.ts` - Frontend auth client

## Database Tables
- `app."user"` - User accounts
- `app."account"` - Credentials (password hash in `password` column where `provider_id='credential'`)
- `app."session"` - Sessions with `current_tenant_id` for tenant context
- `app."verification"` - Email verification tokens

## Auth Endpoints (Better Auth)
```
POST /api/auth/sign-up/email    # Register
POST /api/auth/sign-in/email    # Login
POST /api/auth/sign-out         # Logout
GET  /api/auth/session          # Get session
```

## Custom Auth Routes
```typescript
// Switch tenant
POST /api/v1/auth/switch-tenant { tenantId: "uuid" }

// Get user's tenants
GET /api/v1/auth/tenants
```

## Frontend Auth Client
```typescript
import { signIn, signUp, signOut, useSession } from '~/lib/auth';

// Login
await signIn.email({ email, password });

// Register
await signUp.email({ email, password, name });

// Get session
const { data: session } = useSession();
```

## Tenant Context
- Backend: `store.ctx.tenantId` (set by tenantPlugin)
- Frontend: `session.currentTenantId`
- Tenant stored in session, persisted to `app."session"."currentTenantId"`

## Switch Tenant
```typescript
const switchTenant = useMutation({
  mutationFn: (tenantId) => apiClient.post('/api/v1/auth/switch-tenant', { tenantId }),
  onSuccess: () => queryClient.invalidateQueries(),
});
```

## Important Notes
- Password hash stored in `account` table, NOT `user` table
- `provider_id = 'credential'` for email/password auth
- Never access password directly; use Better Auth APIs
