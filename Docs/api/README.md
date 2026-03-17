# API

> REST API surface: endpoints, request/response contracts, error handling.

## Contents

| File | When to Read |
|------|-------------|
| [API_REFERENCE.md](API_REFERENCE.md) | Looking up endpoints. All 200+ endpoints organized by module with method, path, and description. Covers: auth, HR, time, absence, talent, LMS, cases, onboarding, benefits, documents, succession, analytics, competencies, recruitment, workflows, security, portal, dashboard, system, tenant |
| [ERROR_CODES.md](ERROR_CODES.md) | Handling errors. All error codes with user-facing messages organized by module: generic, auth, tenant, HR, time, absence, workflow, talent, LMS, case |

## Quick Reference

### Base URL

```
http://localhost:3000
```

### Swagger UI

```
http://localhost:3000/docs
```

### Common Headers

| Header | When | Purpose |
|--------|------|---------|
| `Cookie: hris_session=...` | Always | Session auth |
| `X-CSRF-Token` | POST/PUT/PATCH/DELETE | CSRF protection |
| `Idempotency-Key` | POST/PUT/PATCH/DELETE | Deduplication |
| `Content-Type: application/json` | Request body | Body format |
| `X-Tenant-ID` | Optional | Explicit tenant |

### Response Shape

**Success:**
```json
{ "data": {...}, "pagination": { "nextCursor": "...", "hasMore": true } }
```

**Error:**
```json
{ "error": { "code": "ERROR_CODE", "message": "...", "requestId": "req_..." } }
```

### Pagination

Cursor-based. Parameters: `cursor` (string), `limit` (number, default 20, max 100).

### API Prefix

All module endpoints are under `/api/v1/`. Example: `/api/v1/hr/employees`.

### Endpoint Count by Module

| Module | Endpoints |
|--------|:---------:|
| HR (employees, org units, positions) | ~20 |
| Time & Attendance | 16 |
| Absence | 12 |
| Talent | 16 |
| LMS | 8 |
| Cases | 7 |
| Onboarding | 7 |
| Benefits | ~12 |
| Documents | 11 |
| Succession | 13 |
| Analytics | 13 |
| Competencies | 15 |
| Recruitment | 15 |
| Workflows | 13 |
| Security | 14 |
| Portal | 5 |
| Auth | 5 |
| Other (dashboard, system, tenant) | 4 |
