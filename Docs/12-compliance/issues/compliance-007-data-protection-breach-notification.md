# [COMPLIANCE] GDPR Data Breach Notification Capability Missing

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

*Last updated: 2026-03-28*

**Priority:** HIGH
**Labels:** compliance, security, enhancement
**Effort:** MEDIUM

## Description
Under UK GDPR Article 33, personal data breaches must be reported to the ICO within 72 hours if they pose a risk to individuals. The platform has no breach detection, notification workflow, or ICO reporting capability. For an HRIS handling sensitive employee PII, this is a significant compliance gap.

## Current State
- No breach incident tracking
- No 72-hour countdown mechanism
- No affected data scope assessment
- No notification templates
- No ICO reporting workflow
- No employee notification system for high-risk breaches (Article 34)

## Expected State
- Breach incident tracking with 72-hour countdown
- Affected data scope assessment tools
- ICO notification template and export
- Employee notification for high-risk breaches
- Audit trail of breach handling activities

## Acceptance Criteria
- [ ] Breach incident tracking table and workflow created
- [ ] 72-hour countdown from discovery with escalating notifications
- [ ] Data scope assessment: number of affected individuals, types of data compromised
- [ ] ICO notification template with required fields (nature of breach, categories of data, approximate number of individuals, likely consequences, measures taken)
- [ ] Employee notification workflow for high-risk breaches
- [ ] Breach log maintained for regulatory audits
- [ ] Integration with case management for investigation tracking

## Implementation Notes
Build on the existing case management module. Create a `data_breach` case category with specific workflow stages: discovery -> assessment -> notification -> remediation -> closure. Add a 72-hour deadline tracker wired into the scheduler.

## Affected Files
- `packages/api/src/modules/cases/service.ts`
- `packages/api/src/worker/scheduler.ts`
- New migration for breach tracking fields
- `packages/api/src/jobs/notification-worker.ts`

## Related Issues
- security-006-gdpr-dsar-endpoint
- security-007-data-erasure-missing
