# [COMPLIANCE] Equality & Diversity Monitoring Incomplete

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

*Last updated: 2026-03-28*

**Priority:** MEDIUM
**Labels:** compliance, enhancement
**Effort:** MEDIUM

## Description
Under the Equality Act 2010, organisations should monitor workforce diversity for equal opportunities compliance. Protected characteristics data must be handled with extra care. The system stores gender and nationality but lacks ethnicity, disability, religion/belief, sexual orientation, and age band recording. No reasonable adjustment tracking exists for disabled employees.

## Current State
- `employee_personal` stores `gender` and `nationality` (marked sensitive)
- `life_event_type` enum includes `disability`
- No ethnicity recording
- No disability recording or reasonable adjustment tracking
- No religion/belief recording
- No sexual orientation recording
- No age band reporting
- No aggregated diversity reporting

## Expected State
- Voluntary diversity monitoring fields (separate from core HR data)
- Explicit consent recording for optional data processing
- "Prefer not to say" options for all characteristics
- Aggregated, anonymised diversity reporting
- Reasonable adjustment request and tracking module

## Acceptance Criteria
- [ ] Voluntary diversity monitoring fields added (ethnicity, disability, religion, sexual orientation)
- [ ] Explicit consent recording for diversity data collection
- [ ] "Prefer not to say" option for all protected characteristics
- [ ] Data accessible only for aggregated reporting (not individual records in normal HR views)
- [ ] Diversity dashboard with anonymised statistics
- [ ] Reasonable adjustment request and tracking module
- [ ] Field-level permissions restrict access to diversity data

## Implementation Notes
Create a separate `diversity_monitoring` table to keep this data isolated from core HR records. Use the field permission system to restrict access. Ensure all diversity reporting is aggregated (minimum group size of 10 to prevent identification).

## Affected Files
- New migration for `diversity_monitoring` table
- `packages/api/src/modules/hr/service.ts`
- New: diversity reporting in analytics module

## Related Issues
- compliance-010-gender-pay-gap-reporting
