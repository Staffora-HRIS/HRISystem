# [SECURITY] No Request Body Size Limit Configured

**Priority:** MEDIUM
**Labels:** security, enhancement
**Effort:** SMALL

## Description
The Elysia application does not configure a maximum request body size. By default, Bun/Elysia may accept very large request bodies, enabling potential denial-of-service through memory exhaustion. No `bodyLimit`, `maxBodySize`, or body size configuration exists in the API source.

## Current State
- `packages/api/src/app.ts`: no body size limit configured
- Nginx config has `client_max_body_size 50m` but nginx is only in the production profile
- No per-endpoint size limits

## Expected State
- Global body size limit (e.g., 10MB default)
- Larger limits for file upload endpoints
- 413 Payload Too Large response for oversized requests

## Acceptance Criteria
- [ ] Global body size limit of 10MB configured in Elysia
- [ ] File upload endpoints allow up to 50MB
- [ ] Oversized requests return 413 with clear error message
- [ ] Integration test verifies body size enforcement

## Implementation Notes
Use Elysia's `onParse` hook to check `Content-Length` header before parsing. Add per-route overrides for file upload endpoints.

## Affected Files
- `packages/api/src/app.ts`

## Related Issues
- architecture-003-connection-pool-exhaustion
