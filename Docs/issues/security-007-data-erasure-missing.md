# [SECURITY] GDPR Right to Erasure / Data Anonymisation Not Implemented

**Priority:** HIGH
**Labels:** compliance, security, enhancement
**Effort:** LARGE

## Description
The platform has no mechanism for data anonymisation or erasure to comply with GDPR Article 17 (Right to Erasure). Employee records can be soft-deleted (terminated status), but personal data remains intact indefinitely. No anonymisation functions, data purging routines, or erasure endpoints exist. No configurable data retention policies are implemented.

## Current State
- No anonymisation functions in codebase
- No data purging routines
- No erasure endpoints
- No configurable retention policies
- Settings UI shows "Data Management" section marked `available: false`
- Employee termination preserves all PII

## Expected State
- Data anonymisation function replacing PII with anonymised values
- Scheduled job for automatic anonymisation after configurable retention periods
- Manual erasure requests with proper authorization (tenant_admin role)
- Audit records of erasure operations
- Legal hold capability to prevent erasure during litigation

## Acceptance Criteria
- [ ] Anonymisation function replaces PII fields with hashed/anonymised values
- [ ] Configurable per-tenant retention periods by data category
- [ ] Automated scheduled job for retention enforcement
- [ ] Manual erasure request workflow with admin approval
- [ ] Legal hold flag prevents erasure of held records
- [ ] Audit trail records all erasure operations
- [ ] Erasure respects legal obligations (e.g., 6-year tax record retention)

## Implementation Notes
Create anonymisation functions that replace PII (name, email, address, phone, NI number, bank details) with irreversible hashed values. Maintain referential integrity by keeping record structure. Add retention configuration to tenant settings.

## Affected Files
- New: `packages/api/src/modules/gdpr/` (if not already created for DSAR)
- `packages/api/src/worker/scheduler.ts`
- `packages/web/app/routes/(admin)/settings/index.tsx`
- New migration for retention policy table

## Related Issues
- security-006-gdpr-dsar-endpoint
