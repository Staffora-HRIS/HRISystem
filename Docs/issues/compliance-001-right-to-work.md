# [COMPLIANCE] Right to Work Verification Workflow Missing

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

**Priority:** CRITICAL
**Labels:** compliance, enhancement
**Effort:** LARGE

## Description
UK employers must verify every employee's right to work before employment begins (Immigration, Asylum and Nationality Act 2006; Immigration Act 2016). Failure carries unlimited fines and up to 5 years imprisonment. The system has `employee_identifiers` fields for passport and national_id, and the field registry defines `work_permit_number`/`work_permit_expiry`, but there is no verification workflow, status tracking, prescribed document check flow, or follow-up scheduling.

## Current State
- `migrations/0021_employee_identifiers.sql`: document storage exists (passport, national_id)
- `migrations/0120_seed_field_registry.sql`: `work_permit_number` and `work_permit_expiry` defined
- `app.get_expiring_identifiers()` and `app.get_expired_identifiers()` functions exist but are generic
- No verification status tracking (verified/pending/expired)
- No prescribed document check workflow (List A / List B)
- No follow-up check scheduling

## Expected State
- Dedicated right-to-work verification module
- Mandatory completion before employee status moves from `pending` to `active`
- Automated alerts for expiring documents (30/60/90 day warnings)
- Home Office online checking service integration endpoint

## Acceptance Criteria
- [ ] `right_to_work_checks` table created with check_type, check_date, document_type, status, expiry, next_check_date
- [ ] Verification workflow blocks employee activation until verified
- [ ] Automated alerts at 30/60/90 days before expiry wired into notification worker
- [ ] List A / List B document classification supported
- [ ] Repeat check scheduling for time-limited permissions
- [ ] Share code recording for online checks
- [ ] Audit trail for all verification actions

## Implementation Notes
Create a new migration for `right_to_work_checks` table. Add a guard in the HR service's `activateEmployee()` method requiring a verified RTW check. Wire expiry alerts into the scheduler and notification worker.

## Affected Files
- New migration: `right_to_work_checks` table
- `packages/api/src/modules/hr/service.ts` (activation guard)
- `packages/api/src/worker/scheduler.ts` (expiry alerts)
- `packages/api/src/jobs/notification-worker.ts`

## Related Issues
- compliance-009-employment-contracts
