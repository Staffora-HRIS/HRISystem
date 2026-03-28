# [COMPLIANCE] Employment Contract Statement Generation Missing

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

*Last updated: 2026-03-28*

**Priority:** HIGH
**Labels:** compliance, enhancement
**Effort:** MEDIUM

## Description
Since April 2020, all UK employees and workers must receive a written statement of terms on or before their first day of work. The system has a good contract data model with employment type, FTE, hours, probation, notice periods, and effective dating, but lacks contract template generation with statutory required fields, day-one statement generation triggered by hire, and contract acknowledgement/signature tracking.

## Current State
- `migrations/0022_employment_contracts.sql`: stores contract_type, employment_type, fte, hours, probation, notice_period
- `compensation_history` table stores salary with pay frequency
- Documents module can generate `contract` and `employment_letter` types
- No contract template system with statutory required field validation
- No day-one statement generation triggered by hire
- No signature/acknowledgement tracking
- No notification to employee of contract changes (1-month deadline)

## Expected State
- Contract template system with all statutory required fields
- Auto-generated day-one written statement from employee/contract/compensation data
- Signature/acknowledgement tracking
- Automatic notification on contract changes with 1-month deadline

## Acceptance Criteria
- [ ] Contract template system with statutory minimum field validation
- [ ] Auto-generation of day-one written statement triggered by employee creation
- [ ] Template includes: employer name, employee name, start date, job title, place of work, pay, hours, holiday, notice periods, probation
- [ ] Acknowledgement/signature tracking (date, method)
- [ ] Contract change notification with 1-month deadline
- [ ] Statutory minimum notice period calculation based on service length (1 week per year, up to 12 weeks)
- [ ] Validation that contractual notice meets statutory minimum

## Implementation Notes
Use the PDF worker for document generation. Create contract templates with merge fields populated from employee, contract, and compensation data. Add a trigger in the HR service's `createEmployee()` to auto-generate the day-one statement.

## Affected Files
- `packages/api/src/modules/documents/service.ts`
- `packages/api/src/modules/hr/service.ts`
- `packages/api/src/jobs/pdf-worker.ts`
- New: contract template definitions

## Related Issues
- compliance-001-right-to-work
