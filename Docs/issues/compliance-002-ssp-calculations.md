# [COMPLIANCE] Statutory Sick Pay (SSP) Calculations Not Implemented

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

**Priority:** CRITICAL
**Labels:** compliance, enhancement
**Effort:** LARGE

## Description
UK employers must pay SSP for up to 28 weeks at the prescribed rate (GBP 116.75/week for 2024-25). The system can track sick absence via leave types but has no SSP rate calculation, no waiting day logic (first 3 qualifying days unpaid), no linking of Periods of Incapacity for Work (PIW), no lower earnings limit check, no 28-week maximum tracking, no SSP1 form generation, and no fit note tracking.

## Current State
- `leave_types` table has a `sick` category
- Leave request system tracks sick absence
- No SSP rate calculation logic
- No waiting day logic (3-day threshold)
- No PIW linking rules (8-week linking period)
- No lower earnings limit check
- No 28-week maximum tracking
- No SSP1 form generation
- No fit note / self-certification tracking (7-day threshold)

## Expected State
- SSP calculation engine with current rates, waiting days, linking rules
- Fit note / medical certificate tracking with 7-day self-certification threshold
- PIW linking for absences within 8 weeks
- SSP1 form generation when employee reaches 28-week limit
- Lower earnings limit validation against employee pay

## Acceptance Criteria
- [ ] SSP calculation engine created with current statutory rates
- [ ] 3-day waiting period correctly applied to new PIWs
- [ ] PIW linking rule: absences within 8 weeks linked as continuous
- [ ] Lower earnings limit check prevents SSP for ineligible employees
- [ ] 28-week maximum tracked per PIW
- [ ] Fit note tracking with 7-day self-certification threshold
- [ ] SSP1 form generation when 28 weeks exhausted
- [ ] SSP rates configurable for annual updates

## Implementation Notes
Create an `ssp_calculation` service within the absence module. Track PIW periods in a dedicated table linked to leave requests. Calculate SSP based on qualifying days (contracted work days). Integrate with payroll data export.

## Affected Files
- New migration: `ssp_periods` table
- `packages/api/src/modules/absence/service.ts`
- New: SSP calculation utility
- `packages/api/src/jobs/pdf-worker.ts` (SSP1 form)

## Related Issues
- compliance-003-family-leave
- compliance-006-hmrc-integration
