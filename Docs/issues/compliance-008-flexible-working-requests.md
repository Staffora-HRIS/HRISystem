# [COMPLIANCE] Flexible Working Request System Not Implemented

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

**Priority:** HIGH
**Labels:** compliance, enhancement
**Effort:** MEDIUM

## Description
Since April 2024, all UK employees have the right to request flexible working from day one (previously required 26 weeks' service). Employers must respond within 2 months. Employees can make 2 requests per 12 months. The system has no flexible working request form, formal response tracking, request count enforcement, appeal process, or business reason recording for refusal (8 statutory grounds).

## Current State
- No flexible working request workflow
- No formal response tracking with 2-month deadline
- No request count tracking (max 2 per 12 months)
- No appeal process
- No statutory grounds for refusal recording

## Expected State
- Dedicated flexible working request module
- Request form with proposed changes and business case
- Manager consideration workflow with 2-month deadline
- Request count enforcement (max 2 per rolling 12 months)
- Recording of statutory grounds for any refusal
- Appeal process support

## Acceptance Criteria
- [ ] `flexible_working_requests` table created with request details, proposed changes, business case
- [ ] Formal workflow: submitted -> under_consideration -> approved/refused/withdrawn
- [ ] 2-month response deadline tracked with notifications at 7, 14, 30, 45, 56 days
- [ ] Request count per employee per rolling 12-month period enforced (max 2)
- [ ] 8 statutory grounds for refusal available as structured reasons
- [ ] Appeal workflow with different decision maker requirement
- [ ] Day-one eligibility (no minimum service requirement)

## Implementation Notes
Create a new module or extend the cases module with a dedicated flexible working workflow. The 8 statutory grounds for refusal are: burden of additional costs, detrimental effect on quality/performance, inability to reorganise work, inability to recruit additional staff, detrimental impact on quality, insufficient work during proposed periods, planned structural changes, any other relevant ground.

## Affected Files
- New migration for `flexible_working_requests` table
- New: `packages/api/src/modules/flexible-working/` or extend cases module
- `packages/api/src/worker/scheduler.ts` (deadline tracking)

## Related Issues
- compliance-009-employment-contracts
