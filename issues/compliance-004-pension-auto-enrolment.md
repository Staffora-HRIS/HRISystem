# [COMPLIANCE] Pension Auto-Enrolment Engine Missing

**Priority:** CRITICAL
**Labels:** compliance, enhancement
**Effort:** XL

## Description
UK employers must automatically enrol eligible jobholders (aged 22 to state pension age, earning above GBP 10,000/year) into a qualifying workplace pension scheme with minimum 3% employer contribution. The benefits module has a generic `retirement` category but no UK-specific auto-enrolment logic: no eligibility assessment, no automatic enrolment trigger, no opt-out window management, no qualifying earnings band calculation, no minimum contribution enforcement, no re-enrolment processing, and no TPR (The Pensions Regulator) declaration.

## Current State
- `migrations/0101_benefits_types.sql`: `retirement` benefit category exists
- `migrations/0102_benefit_plans.sql`: generic plan definitions with employee/employer contributions
- `migrations/0103_benefit_enrollments.sql`: generic enrollment management
- No age/earnings threshold assessment
- No automatic enrolment trigger
- No opt-out window (1 month) management
- No qualifying earnings band calculation
- No minimum contribution rate enforcement (8% total: 5% employee + 3% employer)
- No 3-yearly re-enrolment processing
- No TPR declaration of compliance

## Expected State
- Auto-enrolment assessment engine checking age and earnings thresholds
- Automatic enrolment with opt-out window tracking
- Qualifying earnings band calculation and minimum contribution enforcement
- 3-yearly re-enrolment processing
- TPR reporting/declaration integration

## Acceptance Criteria
- [ ] Eligibility assessment engine: age 22-SPA, earnings above GBP 10,000/year
- [ ] Automatic enrolment triggered when criteria met
- [ ] 1-month opt-out window tracked with refund processing
- [ ] Qualifying earnings band calculation (lower/upper limits)
- [ ] Minimum contribution rates enforced (3% employer, 5% employee)
- [ ] 3-yearly re-enrolment scheduled job
- [ ] Postponement period tracking (up to 3 months)
- [ ] Contribution rates configurable for annual threshold updates
- [ ] TPR declaration data export

## Implementation Notes
Build on the existing benefits module. Create an auto-enrolment service that runs as a scheduled job, assessing all employees monthly. Add pension-specific enrollment states (auto-enrolled, opted-out, opt-in, entitled worker). Store UK statutory thresholds in a configuration table for annual updates.

## Affected Files
- `packages/api/src/modules/benefits/service.ts`
- `packages/api/src/modules/benefits/repository.ts`
- `packages/api/src/worker/scheduler.ts`
- New migration for pension auto-enrolment configuration
- New: auto-enrolment assessment utility

## Related Issues
- compliance-006-hmrc-integration
