# [COMPLIANCE] Disciplinary & Grievance ACAS Code of Practice Workflow Missing

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

*Last updated: 2026-03-28*

**Priority:** HIGH
**Labels:** compliance, enhancement
**Effort:** LARGE

## Description
The ACAS Code of Practice on Disciplinary and Grievance Procedures requires formal investigation, written notification, hearing with right to be accompanied, written outcome, and right of appeal. Employment tribunals can increase awards by 25% for failure to follow the Code. The case management module provides a foundation but lacks ACAS-compliant workflow stages, hearing management, warning tracking, and appeal processes.

## Current State
- Cases module has status workflow: new -> open -> pending -> resolved -> closed
- `case_type` includes `complaint` and `escalation`
- `case_comments` and `case_attachments` for evidence
- SLA tracking exists
- Shared types include `grievance` and `employee_relations` categories
- No ACAS-compliant stages (investigation -> hearing -> outcome -> appeal)
- No hearing scheduling or companion notification
- No warning register (verbal, written, final warning)
- No warning expiry tracking
- No formal appeal process with different decision maker

## Expected State
- Disciplinary/grievance-specific case categories with ACAS stages
- Hearing management with scheduling and companion notification
- Warning register with expiry dates
- Appeal workflow ensuring different decision maker
- Investigation assignment and evidence collection
- Distinction between informal and formal procedures

## Acceptance Criteria
- [ ] ACAS-compliant workflow stages: investigation -> hearing -> outcome -> appeal
- [ ] Hearing scheduling with minimum notice periods
- [ ] "Right to be accompanied" notification and tracking
- [ ] Warning register: verbal, written, final warning with expiry dates
- [ ] Sanction recording linked to case outcome
- [ ] Appeal process with different decision maker requirement
- [ ] Investigation assignment and evidence collection workflow
- [ ] Informal vs formal procedure distinction
- [ ] Notification templates for each stage

## Implementation Notes
Extend the cases module with a disciplinary/grievance-specific workflow. Create additional case categories and workflow stages. Add a `warnings` table linked to employees with expiry tracking.

## Affected Files
- `packages/api/src/modules/cases/service.ts`
- `packages/api/src/modules/cases/repository.ts`
- New migration for warning register and hearing tables
- `packages/shared/src/state-machines/` (new disciplinary state machine)

## Related Issues
- None
