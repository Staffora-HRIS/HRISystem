# Escalation Matrix

*Last updated: 2026-03-28*

This document defines the escalation paths and responsibilities for production incidents affecting the Staffora HRIS platform.

## Severity Levels and Response Times

| Severity | Label | Response Time | Update Frequency | Escalation Deadline |
|----------|-------|---------------|-------------------|---------------------|
| P1 | Critical | 15 minutes | Every 30 minutes | Escalate to L2 after 30 min, L3 after 1 hour |
| P2 | High | 1 hour | Every 2 hours | Escalate to L2 after 2 hours, L3 after 4 hours |
| P3 | Medium | 4 hours | Daily | Escalate to L2 after 1 business day |
| P4 | Low | Next business day | Weekly | No escalation needed |

## Escalation Levels

### Level 1 -- On-Call Engineer

**Who:** The engineer on the current on-call rotation.

**Responsibilities:**
- Acknowledge the alert within the response time.
- Open the relevant runbook and begin immediate actions.
- Assess severity and adjust if needed.
- Communicate status in the incident channel.
- Resolve P3/P4 incidents independently.

**Escalate when:**
- The issue is not resolved within 30 minutes (P1) or 2 hours (P2).
- The root cause is unclear after initial investigation.
- The incident involves data loss, security breach, or GDPR implications.
- The fix requires changes outside the engineer's area of expertise.

### Level 2 -- Engineering Lead

**Who:** The engineering team lead or senior engineer.

**Responsibilities:**
- Join the incident call and take over coordination if needed.
- Make decisions about rollbacks, hotfixes, or emergency deployments.
- Coordinate across teams if multiple systems are affected.
- Approve emergency changes that bypass normal review processes.

**Escalate when:**
- The incident has customer-facing impact lasting more than 1 hour.
- A database restore from backup is needed.
- A security incident is confirmed.
- Business or compliance decisions are needed (e.g., ICO notification).

### Level 3 -- CTO / Head of Engineering

**Who:** CTO or Head of Engineering.

**Responsibilities:**
- Make organisational decisions (e.g., all-hands mobilisation, vendor engagement).
- Approve external communications (status page updates, customer notifications).
- Coordinate with the DPO for GDPR breach notifications.
- Authorise budget for emergency vendor support.

**Escalate when:**
- The incident affects all customers and cannot be resolved within 4 hours.
- A confirmed data breach requires ICO notification.
- Media or regulatory attention is expected.

## Role Assignments During an Incident

| Role | Responsibility |
|------|----------------|
| **Incident Commander** | Coordinates the response, delegates tasks, makes decisions. Usually the L1 on-call for P3/P4, L2 for P1/P2. |
| **Technical Lead** | Performs root cause analysis and implements the fix. |
| **Communications Lead** | Updates the status page, notifies stakeholders, and manages the incident channel. |
| **Scribe** | Documents the timeline, actions taken, and decisions made for the post-incident review. |

For P1 and P2 incidents, all four roles should be assigned. For P3/P4, the on-call engineer fills all roles.

## Communication Channels

| Channel | Purpose |
|---------|---------|
| **Incident Slack channel** | Real-time coordination during the incident. Create `#incident-YYYY-MM-DD-<short-name>`. |
| **Status page** | Customer-facing updates. Update at each severity-appropriate interval. |
| **Email** | Post-incident summary to stakeholders. |
| **Phone/video call** | P1 incidents: start a call immediately. Share the link in the incident channel. |

## Incident Lifecycle

```
Detection
    |
    v
Acknowledge (within response time)
    |
    v
Triage (assign severity, open runbook)
    |
    v
Contain (stop the bleeding)
    |
    v
Investigate (find root cause)
    |
    v
Resolve (apply fix, verify)
    |
    v
Communicate (update status page, notify stakeholders)
    |
    v
Post-Incident Review (within 48 hours for P1/P2)
```

## Runbook Quick Reference

| Symptom | Runbook |
|---------|---------|
| Database connections maxed out | [Database Connection Exhaustion](database-connection-exhaustion.md) |
| Redis OOM errors | [Redis Memory Full](redis-memory-full.md) |
| High 5xx error rate | [API 5xx Spike](api-5xx-spike.md) |
| Deployment broke production | [Failed Deployment Rollback](failed-deployment-rollback.md) |
| Migration failed | [Database Migration Failure](database-migration-failure.md) |
| Security breach suspected | [Security Incident](security-incident.md) |
| TLS certificate expired | [SSL Certificate Expiry](ssl-certificate-expiry.md) |
| Disk full on host or volumes | [Disk Space Full](disk-space-full.md) |

## On-Call Expectations

1. **Availability:** Respond to alerts within 15 minutes during on-call hours.
2. **Access:** Ensure you have SSH/VPN access to production infrastructure and Docker hosts.
3. **Tools:** Have `docker`, `psql`, `redis-cli`, `curl`, and `jq` available locally.
4. **Runbooks:** Familiarise yourself with all runbooks before starting an on-call rotation.
5. **Handoff:** At rotation end, brief the next on-call engineer on any open issues.

## After the Incident

1. Complete the [Post-Incident Template](post-incident-template.md) within 48 hours for P1/P2 incidents.
2. Schedule a blameless post-incident review meeting within 1 week.
3. Create follow-up tickets for all action items identified during the review.
4. Update the relevant runbook if the incident revealed gaps in the documentation.
