# [COMPLIANCE] Holiday Entitlement UK Statutory Minimum Not Enforced

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

**Priority:** HIGH
**Labels:** compliance, enhancement
**Effort:** MEDIUM

## Description
UK workers are entitled to 5.6 weeks' paid annual leave (28 days for full-time, pro-rata for part-time) under the Working Time Regulations 1998. The system has a robust leave management infrastructure but no enforcement of the 28-day statutory minimum. Policies can be configured with any `default_balance` including below the legal minimum. Additionally, no 52-week reference period holiday pay calculation exists, bank holiday treatment is not configurable, and carryover rules do not distinguish between the 4-week EU-derived entitlement and the 1.6-week additional statutory entitlement.

## Current State
- Leave policies configurable with any `default_balance` (no minimum check)
- Pro-rata calculation via `app.calculate_prorated_balance()` exists
- `public_holidays` table supports country-specific holidays
- `leave_policies` has `max_carryover` and `carryover_expiry_months`
- No validation that `default_balance >= 28` for UK workers
- No holiday pay calculation (52-week reference period)
- No bank holiday treatment configuration (included vs additional)
- No two-tier carryover rules (4-week EU vs 1.6-week additional)

## Expected State
- Statutory minimum validation: 28 days FTE for GBR country code
- Pro-rata calculation linked to FTE for part-time workers
- Bank holiday treatment configurable per policy (included/additional)
- Holiday pay calculation using 52-week reference period
- Two-tier carryover rules with sickness/maternity protection

## Acceptance Criteria
- [ ] Validation prevents creating leave policies below 28 days FTE for UK employees
- [ ] Warning displayed when configuring policies near statutory minimum
- [ ] Pro-rata automatically calculated: `Math.min(5.6 * days_per_week, 28)`
- [ ] Bank holiday treatment configurable: included in entitlement or additional
- [ ] 52-week reference period holiday pay calculation (including regular overtime, commission, bonuses)
- [ ] Carryover rules split: 4-week tier (restricted) vs 1.6-week tier (employer configurable)
- [ ] Sickness/maternity carryover protection for the 4-week tier

## Implementation Notes
Add country-specific validation in `AbsenceService.createLeavePolicy()`. Create a compliance check function that audits all UK employees' entitlements. The holiday pay calculation requires integration with compensation/payroll data.

## Affected Files
- `packages/api/src/modules/absence/service.ts`
- `packages/api/src/modules/absence/schemas.ts`
- New: UK statutory leave compliance utilities

## Related Issues
- compliance-003-family-leave
