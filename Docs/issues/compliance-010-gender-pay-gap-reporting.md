# [COMPLIANCE] Gender Pay Gap Reporting Not Implemented

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

**Priority:** HIGH
**Labels:** compliance, enhancement
**Effort:** MEDIUM

## Description
UK organisations with 250+ employees must publish annual gender pay gap data including mean/median hourly pay gaps, bonus gaps, and proportion in pay quartiles. The system stores gender in `employee_personal` and salary in `compensation_history` but has no gender pay gap report template or calculation logic.

## Current State
- `employee_personal` table stores `gender` (male, female, other, prefer_not_to_say)
- `compensation_history` table stores base salary
- Analytics module has report infrastructure but no gender pay gap report
- No pay gap calculation logic
- No quartile distribution calculation
- No bonus gap calculation

## Expected State
- Gender pay gap report with all required metrics
- Mean and median hourly pay gap calculations
- Bonus gap calculations (mean/median)
- Quartile distribution by gender
- Report generation for statutory publication deadline

## Acceptance Criteria
- [ ] Mean hourly pay gap calculation (percentage difference)
- [ ] Median hourly pay gap calculation
- [ ] Mean bonus gap calculation
- [ ] Median bonus gap calculation
- [ ] Proportion of men/women receiving bonuses
- [ ] Pay quartile distribution by gender
- [ ] Report exportable for publication
- [ ] Snapshot date configurable (default: 5 April each year)

## Implementation Notes
Create a new report type in the analytics module. Calculate hourly rate from annual salary and contracted hours. The report requires data from `employee_personal` (gender), `compensation_history` (salary), and `employment_contracts` (hours). Consider storing bonus data separately.

## Affected Files
- `packages/api/src/modules/analytics/service.ts`
- `packages/api/src/modules/analytics/repository.ts`
- New: gender pay gap calculation utility

## Related Issues
- compliance-011-equality-diversity
