# Post-Incident Review Template

*Last updated: 2026-03-28*

Copy this template for each incident review. Fill in all sections within 48 hours of resolution for P1/P2 incidents.

---

## Incident Report: [TITLE]

**Date:** YYYY-MM-DD
**Severity:** P1 / P2 / P3 / P4
**Duration:** HH:MM (from detection to resolution)
**Incident Commander:** [Name]
**Author:** [Name]
**Status:** Draft / Final

## Summary

_One paragraph describing what happened, who was affected, and the business impact._

## Timeline (UTC)

| Time | Event |
|------|-------|
| HH:MM | [Detection] Alert fired / User reported issue |
| HH:MM | [Acknowledge] On-call engineer acknowledged |
| HH:MM | [Triage] Severity assessed as PX |
| HH:MM | [Action] Describe the first mitigation step taken |
| HH:MM | [Escalation] Escalated to L2 (if applicable) |
| HH:MM | [Mitigation] Service partially restored |
| HH:MM | [Resolution] Root cause fix deployed |
| HH:MM | [Verification] All systems confirmed healthy |

## Detection

_How was the incident detected? (Alert, user report, monitoring dashboard, etc.)_

**Time to detect:** _How long between the start of the issue and detection?_

## Impact

### User Impact
_How many users were affected? What functionality was unavailable?_

### Data Impact
_Was any data lost, corrupted, or exposed?_

### Financial Impact
_Estimated cost (downtime, lost productivity, remediation effort)._

### Compliance Impact
_Any GDPR, ICO notification, or regulatory implications?_

## Root Cause

_Detailed explanation of WHY the incident happened. Go beyond the immediate trigger to find contributing factors._

### Five Whys

1. **Why** did the incident happen?
   - _Answer_
2. **Why** did that happen?
   - _Answer_
3. **Why** did that happen?
   - _Answer_
4. **Why** did that happen?
   - _Answer_
5. **Why** did that happen?
   - _Answer_

## Resolution

_What was done to resolve the incident? Include specific commands, code changes, or configuration changes._

## What Went Well

- _Example: The runbook for [X] was accurate and easy to follow._
- _Example: Time to detection was under 5 minutes._
-

## What Could Be Improved

- _Example: The alert did not include enough context to quickly identify the affected service._
- _Example: The runbook did not cover this specific failure mode._
-

## Action Items

| Priority | Action | Owner | Due Date | Status |
|----------|--------|-------|----------|--------|
| High | _Example: Add monitoring for X_ | [Name] | YYYY-MM-DD | Open |
| Medium | _Example: Update runbook for Y_ | [Name] | YYYY-MM-DD | Open |
| Low | _Example: Investigate long-term fix for Z_ | [Name] | YYYY-MM-DD | Open |

## Metrics

| Metric | Value |
|--------|-------|
| Time to detect (TTD) | _minutes_ |
| Time to acknowledge (TTA) | _minutes_ |
| Time to mitigate (TTM) | _minutes_ |
| Time to resolve (TTR) | _minutes_ |
| Total downtime | _minutes_ |
| Users affected | _count_ |
| Error rate peak | _percentage_ |

## Related Runbooks

- [Runbook used during this incident](link)

## Appendix

_Attach relevant log snippets, screenshots, or queries used during investigation. Remove any sensitive data (passwords, tokens, personal information) before attaching._

---

## Review Checklist

Before marking this report as Final, verify:

- [ ] Timeline is complete and accurate (UTC timestamps).
- [ ] Root cause identifies WHY, not just WHAT happened.
- [ ] All action items have an owner and due date.
- [ ] The report is blameless -- focuses on systems, not individuals.
- [ ] Sensitive data (credentials, PII) has been redacted.
- [ ] The relevant runbook has been updated if gaps were found.
- [ ] GDPR implications have been assessed (for data-related incidents).
