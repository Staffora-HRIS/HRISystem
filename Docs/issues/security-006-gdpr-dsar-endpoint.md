# [SECURITY] GDPR Data Subject Access Request (DSAR) Endpoint Missing

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

**Priority:** HIGH
**Labels:** compliance, security, enhancement
**Effort:** LARGE

## Description
The platform has no endpoint or mechanism to export all personal data for a specific individual (GDPR Article 15 -- Right of Access). GDPR requires that data subjects can request a copy of all their personal data within 30 days. Without this capability, the platform cannot comply with Article 15 or UK GDPR.

## Current State
- No DSAR endpoint exists in any API module
- No data aggregation function across modules
- No DSAR request tracking or deadline management
- Zero references to `data.?export`, `subject.?access`, `right.?to.?erasure`, `gdpr`, or `anonymi[sz]e` in API modules

## Expected State
- DSAR request handling workflow with deadline tracking
- Data export endpoint aggregating all personal data across modules
- Identity verification step before data release
- Redaction tooling for third-party data in responses
- Audit trail of all DSAR requests and responses

## Acceptance Criteria
- [ ] DSAR request endpoint created (`POST /api/v1/gdpr/dsar`)
- [ ] Data export aggregates: employees, contacts, addresses, identifiers, compensation, leave, performance, documents
- [ ] Export format: structured JSON and CSV
- [ ] 30-day deadline tracking with notifications at 7, 14, 21 days
- [ ] Identity verification before data release
- [ ] DSAR requests logged in audit trail
- [ ] Admin dashboard for DSAR request management

## Implementation Notes
Create a new `gdpr` module with `routes.ts`, `service.ts`, `repository.ts`. The service queries all personal data tables for a given employee/user. Consider streaming large exports. Integrate with notification worker for deadline reminders.

## Affected Files
- New: `packages/api/src/modules/gdpr/` (routes, service, repository, schemas)
- `packages/api/src/app.ts` (register module)
- `packages/api/src/worker/scheduler.ts` (deadline reminders)

## Related Issues
- security-007-data-erasure-missing
- compliance-007-data-protection-breach-notification
