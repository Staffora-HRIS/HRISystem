# [COMPLIANCE] Family Leave Calculations Not Implemented (Maternity/Paternity/SPL/Adoption)

**Priority:** CRITICAL
**Labels:** compliance, enhancement
**Effort:** XL

## Description
UK family leave statutory calculations are entirely unimplemented. The system has leave type categories for `parental` and `bereavement` but no statutory entitlement calculations. Missing: maternity leave (52 weeks, SMP calculation), paternity leave (2 weeks, SPP), shared parental leave (50 weeks, ShPP), adoption leave (SAP), parental bereavement (2 weeks, SPBP), and unpaid parental leave (18 weeks per child). Each has qualifying criteria, specific payment rates, and compliance obligations.

## Current State
- `leave_type_category` enum includes `parental` and `bereavement`
- `life_event_type` enum includes `adoption`
- No entitlement calculation for any family leave type
- No qualifying service period checks
- No statutory pay rate calculations (SMP, SPP, ShPP, SAP, SPBP)
- No KIT/SPLIT day tracking
- No MATB1 certificate tracking
- No compulsory leave enforcement

## Expected State
- Maternity: 52 weeks leave, SMP calculation (6 weeks at 90% + 33 weeks at statutory rate), qualifying check, KIT day tracking
- Paternity: 2 weeks, SPP at statutory rate, within 56 days of birth/placement
- Shared Parental: curtailment notice, booking periods, ShPP calculation
- Adoption: mirroring maternity provisions with SAP
- Parental Bereavement: 2 weeks, SPBP calculation
- Unpaid Parental: 18 weeks per child, block constraints, annual cap

## Acceptance Criteria
- [ ] Maternity leave entitlement with SMP calculation and qualifying check (26 weeks by 15th week before EWC)
- [ ] Paternity leave with SPP and timing constraints
- [ ] Shared parental leave with curtailment and booking tracking
- [ ] Adoption leave mirroring maternity
- [ ] Parental bereavement with statutory 2-week entitlement
- [ ] Unpaid parental leave with per-child tracking
- [ ] KIT/SPLIT day tracking and limits
- [ ] Return to work date calculations
- [ ] All statutory rates configurable for annual updates

## Implementation Notes
Phase this across multiple sprints. Start with maternity (highest risk), then paternity, then shared parental. Create a `statutory_leave` service within the absence module. Use the existing leave request system but add statutory validation layers.

## Affected Files
- `packages/api/src/modules/absence/service.ts`
- `packages/api/src/modules/absence/repository.ts`
- New migrations for family leave tracking tables
- New: statutory leave calculation utilities

## Related Issues
- compliance-002-ssp-calculations
- compliance-006-hmrc-integration
