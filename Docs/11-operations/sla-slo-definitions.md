# Service Level Objectives (SLOs) and Error Budgets

*Last updated: 2026-03-20*
*Document owner: Platform Engineering*
*Review cadence: Monthly SLO review meeting; quarterly target reassessment*

---

## Table of Contents

1. [Definitions](#1-definitions)
2. [Service Level Objectives](#2-service-level-objectives)
3. [SLI Measurement](#3-sli-measurement)
4. [Error Budgets](#4-error-budgets)
5. [Error Budget Policies](#5-error-budget-policies)
6. [SLO Dashboard](#6-slo-dashboard)
7. [Monthly SLO Review Process](#7-monthly-slo-review-process)
8. [Quarterly Target Reassessment](#8-quarterly-target-reassessment)
9. [Incident Impact Accounting](#9-incident-impact-accounting)
10. [SLO per Module](#10-slo-per-module)
11. [External SLA Commitments](#11-external-sla-commitments)
12. [Related Documents](#12-related-documents)

---

## 1. Definitions

| Term | Definition |
|------|-----------|
| **SLA (Service Level Agreement)** | Contractual commitment to customers. Breach triggers consequences (credits, penalties). |
| **SLO (Service Level Objective)** | Internal target, stricter than the SLA. Provides a buffer before SLA breach. |
| **SLI (Service Level Indicator)** | The measured metric that feeds into an SLO (e.g., request latency, error rate). |
| **Error Budget** | The allowed amount of unreliability. Calculated as `1 - SLO target`. |
| **Burn Rate** | The rate at which the error budget is being consumed. A burn rate of 1.0 means the budget will be exactly exhausted by the end of the window. |

### How SLOs Relate to SLAs

```
SLO (internal, stricter)     SLA (external, contractual)
        99.9%          >           99.5%

If we meet SLOs, we always meet SLAs.
SLO violation = warning.
SLA violation = customer impact + financial penalty.
```

---

## 2. Service Level Objectives

### 2.1 Availability

| SLO | Target | Window | Allowed Downtime |
|-----|--------|--------|-----------------|
| **Platform availability** | 99.9% | Rolling 30 days | 43.2 minutes/month |
| **Platform availability** | 99.9% | Calendar year | 8 hours 45 minutes/year |

**Definition:** The platform is "available" when the `/health` endpoint on at least one API instance returns HTTP 200 within 5 seconds.

**Exclusions:**
- Scheduled maintenance windows (announced 72 hours in advance, max 4 hours/month)
- Force majeure events (as defined in customer contracts)
- Client-side issues (browser bugs, network connectivity)

**Measurement:** Uptime is measured by Route 53 health checks (10-second interval from 3 AWS regions) and by an internal Prometheus `probe_success` metric.

### 2.2 API Latency

| SLO | Target | Window | Measurement Point |
|-----|--------|--------|-------------------|
| **P50 latency** | < 100ms | Rolling 30 days | Server-side (nginx access log `request_time`) |
| **P95 latency** | < 500ms | Rolling 30 days | Server-side (nginx access log `request_time`) |
| **P99 latency** | < 2,000ms | Rolling 30 days | Server-side (nginx access log `request_time`) |

**Definition:** Latency is measured from when nginx receives the complete request to when the response is fully written to the client socket. This includes:
- Elysia.js request parsing and validation
- Database queries via PgBouncer/PostgreSQL
- Redis cache lookups
- Response serialization

**Exclusions:**
- File upload endpoints (`POST /api/v1/documents/upload`) -- measured separately
- Export endpoints (`POST /api/v1/exports/*`) -- long-running by design
- WebSocket connections
- Health check endpoints (`/health`, `/healthz`)

### 2.3 Error Rate

| SLO | Target | Window | Definition |
|-----|--------|--------|-----------|
| **Server error rate** | < 0.1% | Rolling 30 days | Percentage of API requests returning 5xx status codes |

**Definition:** `error_rate = count(status >= 500) / count(all_requests)` over the measurement window.

**Inclusions:** All HTTP responses with status codes 500, 502, 503, 504.

**Exclusions:**
- 4xx errors (client errors, expected behavior)
- Requests blocked by rate limiting (429) -- these are intentional
- Requests blocked by WAF/security rules

### 2.4 Authentication

| SLO | Target | Window | Definition |
|-----|--------|--------|-----------|
| **Login success rate** | > 99.5% | Rolling 30 days | Percentage of login attempts that succeed when credentials are valid |

**Definition:** Of all login attempts where the user provides correct credentials (verified retroactively against the credential store), 99.5% must result in a successful session creation.

**Measurement:**
```
login_success_rate = count(successful_logins) / count(valid_credential_attempts)
```

This excludes:
- Failed logins due to incorrect password (expected behavior)
- Failed logins due to MFA failure (user error)
- Failed logins on disabled/locked accounts (security feature)
- Rate-limited login attempts (security feature)

This includes:
- Better Auth session creation failures
- Database timeouts during authentication
- Redis session cache write failures
- CSRF token validation failures (server-side issue)

### 2.5 Background Processing

| SLO | Target | Window | Definition |
|-----|--------|--------|-----------|
| **Outbox processing latency (P95)** | < 30 seconds | Rolling 30 days | Time from domain event written to outbox to event published to Redis Stream |
| **Notification delivery (P95)** | < 5 minutes | Rolling 30 days | Time from notification event to email/push delivery |
| **Export generation (P95)** | < 2 minutes | Rolling 30 days | Time from export request to file available for download |

---

## 3. SLI Measurement

### 3.1 Data Sources

| SLI | Data Source | Collection Method |
|-----|-----------|-------------------|
| Availability | Route 53 health checks | AWS CloudWatch `HealthCheckStatus` |
| Availability (internal) | Prometheus `probe_success` | Blackbox exporter, 10s interval |
| API latency | nginx access logs | Promtail -> Loki, parsed `request_time` field |
| API latency (detailed) | Elysia.js request duration | Prometheus histogram `http_request_duration_seconds` |
| Error rate | nginx access logs | Promtail -> Loki, parsed `status` field |
| Error rate (internal) | Elysia.js error counter | Prometheus counter `http_requests_total{status=~"5.."}` |
| Login success rate | Better Auth events | Application logs + `app.audit_log` table |
| Outbox latency | `domain_outbox` table | `published_at - created_at` column delta |
| Notification delivery | Worker logs | Prometheus histogram `notification_delivery_seconds` |

### 3.2 Prometheus Recording Rules

```yaml
# prometheus-recording-rules.yml
groups:
  - name: slo_recording
    interval: 30s
    rules:
      # Availability (5-minute window)
      - record: slo:api_availability:ratio_rate5m
        expr: |
          avg_over_time(probe_success{job="staffora-api-health"}[5m])

      # Error rate (5-minute window)
      - record: slo:api_error_rate:ratio_rate5m
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m]))
          /
          sum(rate(http_requests_total[5m]))

      # P95 latency
      - record: slo:api_latency_p95:seconds
        expr: |
          histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

      # P99 latency
      - record: slo:api_latency_p99:seconds
        expr: |
          histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

      # 30-day availability
      - record: slo:api_availability:ratio_rate30d
        expr: |
          avg_over_time(slo:api_availability:ratio_rate5m[30d])

      # 30-day error rate
      - record: slo:api_error_rate:ratio_rate30d
        expr: |
          1 - avg_over_time(slo:api_error_rate:ratio_rate5m[30d])
```

### 3.3 LogQL Queries (Loki)

```logql
# API P95 latency from nginx access logs
quantile_over_time(0.95, {job="nginx"} | json | unwrap request_time [30d])

# Error rate from nginx access logs
sum(count_over_time({job="nginx"} | json | status >= 500 [30d]))
/
sum(count_over_time({job="nginx"} | json [30d]))

# Login success rate
sum(count_over_time({job="staffora-api"} | json | msg="login_success" [30d]))
/
sum(count_over_time({job="staffora-api"} | json | msg=~"login_success|login_failure_server" [30d]))
```

---

## 4. Error Budgets

### 4.1 Budget Calculation

Error budget = `1 - SLO target` expressed as the allowed number of "bad" events in the measurement window.

| SLO | Target | Error Budget (30 days) | Budget in Concrete Terms |
|-----|--------|----------------------|--------------------------|
| Availability (99.9%) | 0.1% downtime | 43.2 minutes | ~43 minutes of total outage |
| P95 latency (< 500ms) | 5% of requests may exceed | 5% of requests | At 1M requests/month: 50,000 slow requests |
| P99 latency (< 2s) | 1% of requests may exceed | 1% of requests | At 1M requests/month: 10,000 very slow requests |
| Error rate (< 0.1%) | 0.1% of requests may be 5xx | 0.1% of requests | At 1M requests/month: 1,000 server errors |
| Login success (> 99.5%) | 0.5% may fail | 0.5% of valid logins | At 10,000 logins/month: 50 auth failures |

### 4.2 Budget Consumption Tracking

The error budget remaining percentage is calculated daily:

```
budget_remaining = 1 - (budget_consumed / budget_total)

Where:
  budget_consumed_availability = minutes_of_downtime_this_month
  budget_total_availability = 43.2 minutes

  budget_consumed_errors = count(5xx_responses_this_month)
  budget_total_errors = 0.001 * total_requests_this_month
```

### 4.3 Burn Rate Alerts

Burn rate measures how fast the error budget is being consumed relative to the window.

| Alert | Burn Rate | Budget Consumed in | Action |
|-------|-----------|-------------------|--------|
| **Page (critical)** | 14.4x | 2% of 30-day budget in 1 hour | Wake on-call engineer |
| **Ticket (warning)** | 6x | 5% of 30-day budget in 6 hours | Create incident ticket |
| **Review (info)** | 1x | Budget on track to exhaust | Discuss in next SLO review |

Prometheus alert rules:

```yaml
groups:
  - name: slo_burn_rate_alerts
    rules:
      # Critical: 14.4x burn rate over 1 hour (pages on-call)
      - alert: SLOAvailabilityBurnRateCritical
        expr: |
          (1 - slo:api_availability:ratio_rate5m) > (14.4 * 0.001)
        for: 5m
        labels:
          severity: critical
          slo: availability
        annotations:
          summary: "Availability error budget burning at 14.4x rate"
          description: "At this rate, the 30-day error budget will be exhausted in {{ $value | humanizeDuration }}"

      # Warning: 6x burn rate over 6 hours
      - alert: SLOAvailabilityBurnRateWarning
        expr: |
          (1 - avg_over_time(slo:api_availability:ratio_rate5m[6h])) > (6 * 0.001)
        for: 10m
        labels:
          severity: warning
          slo: availability
        annotations:
          summary: "Availability error budget burning at 6x rate"

      # Critical: Error rate burn rate
      - alert: SLOErrorRateBurnRateCritical
        expr: |
          slo:api_error_rate:ratio_rate5m > (14.4 * 0.001)
        for: 5m
        labels:
          severity: critical
          slo: error_rate
        annotations:
          summary: "Error rate budget burning at 14.4x rate"

      # Warning: P95 latency exceeding SLO
      - alert: SLOP95LatencyBreach
        expr: |
          slo:api_latency_p95:seconds > 0.5
        for: 10m
        labels:
          severity: warning
          slo: latency_p95
        annotations:
          summary: "API P95 latency exceeds 500ms SLO"
```

---

## 5. Error Budget Policies

### 5.1 Budget Status Levels

| Budget Remaining | Status | Policy |
|-----------------|--------|--------|
| > 50% | **Green** | Normal development velocity. Feature work proceeds. |
| 25% - 50% | **Yellow** | Engineering lead reviews recent incidents. Reliability work prioritized alongside features. |
| 10% - 25% | **Orange** | Feature freeze for the affected service. All engineering effort on reliability. |
| < 10% | **Red** | Full reliability freeze. No deployments except reliability fixes. Post-mortem required for every incident. |
| 0% (exhausted) | **Exhausted** | Change freeze for the rest of the SLO window. Emergency patches only with CTO approval. |

### 5.2 Policy Actions by Status

#### Green (> 50% budget remaining)
- Normal deployment cadence
- Feature development proceeds
- Standard code review process

#### Yellow (25% - 50% budget remaining)
- Engineering lead reviews all recent incidents
- Prioritize reliability-related backlog items
- Increase monitoring on affected components
- No additional process changes

#### Orange (10% - 25% budget remaining)
- Feature freeze for the service consuming the budget
- All deployments require additional review from the engineering lead
- On-call engineer must be available during deployments
- Daily standup includes SLO budget status

#### Red (< 10% budget remaining)
- Complete feature freeze across the platform
- Only reliability improvements and critical bug fixes deployed
- All deployments require approval from engineering lead
- Post-mortem required for every incident, no matter how small
- Daily SLO status report to CTO

#### Exhausted (0% budget remaining)
- Change freeze for the rest of the 30-day window
- Emergency patches only, requiring CTO approval
- Mandatory incident review meeting within 48 hours
- Capacity planning review triggered
- SLO targets reassessed (may indicate targets are too aggressive)

### 5.3 Exceptions

The following do not consume error budget:
- Scheduled maintenance (announced 72+ hours in advance)
- Dependency outages outside our control (AWS region outage, upstream API failure)
- Security-mandated changes (emergency patches, secret rotations)

---

## 6. SLO Dashboard

### 6.1 Grafana Dashboard Layout

The SLO dashboard (`/grafana/d/staffora-slo/service-level-objectives`) shows:

**Row 1: Current Status (Traffic Light)**
| Panel | Content |
|-------|---------|
| Availability | Current 30-day availability percentage with traffic light |
| P95 Latency | Current P95 with traffic light |
| Error Rate | Current 30-day error rate with traffic light |
| Login Success | Current 30-day login success rate with traffic light |

**Row 2: Error Budget Remaining**
| Panel | Content |
|-------|---------|
| Availability Budget | Gauge: minutes remaining out of 43.2 |
| Error Budget | Gauge: errors remaining out of budget |
| Budget Burn Rate | Time series: burn rate over the last 7 days |

**Row 3: Trends**
| Panel | Content |
|-------|---------|
| Availability (30d rolling) | Time series with SLO target line |
| P95/P99 Latency (30d rolling) | Time series with SLO target lines |
| Error Rate (30d rolling) | Time series with SLO target line |
| Login Success (30d rolling) | Time series with SLO target line |

**Row 4: Incident Impact**
| Panel | Content |
|-------|---------|
| Recent incidents | Table: date, duration, budget consumed, description |
| Budget consumption breakdown | Pie chart: incident vs. background errors |

### 6.2 Grafana Dashboard JSON

The dashboard is provisioned automatically via the Grafana provisioning directory:

```
docker/grafana/dashboards/slo-dashboard.json
```

---

## 7. Monthly SLO Review Process

### 7.1 Meeting Cadence

| Meeting | Frequency | Duration | Attendees |
|---------|-----------|----------|-----------|
| SLO Review | Monthly (first Tuesday) | 45 minutes | Engineering lead, on-call engineers, product owner |
| SLO Target Reassessment | Quarterly (first month of quarter) | 60 minutes | CTO, engineering lead, product owner |

### 7.2 Monthly Review Agenda

1. **SLO Status Report** (10 min)
   - Current 30-day availability, latency, error rate, login success
   - Error budget remaining for each SLO
   - Month-over-month trend (improving, stable, degrading)

2. **Incident Review** (15 min)
   - List all incidents that consumed error budget
   - For each incident:
     - Duration and impact (minutes of downtime, number of errors)
     - Root cause (linked to post-mortem)
     - Remediation status (open action items)

3. **Error Budget Forecast** (5 min)
   - Projected budget remaining at end of next 30-day window
   - Based on current burn rate trend
   - Identify any SLOs at risk

4. **Action Items** (10 min)
   - Reliability improvements prioritized from incident learnings
   - Infrastructure changes needed (scaling, redundancy)
   - Monitoring gaps identified

5. **Policy Status** (5 min)
   - Current budget status level (Green/Yellow/Orange/Red)
   - Any active feature freezes or deployment restrictions
   - Changes to on-call procedures

### 7.3 Monthly Review Report Template

```markdown
# Staffora SLO Monthly Review - [Month Year]

## Summary
| SLO | Target | Actual | Status | Budget Remaining |
|-----|--------|--------|--------|-----------------|
| Availability | 99.9% | __% | Green/Yellow/Orange/Red | __% |
| P95 Latency | < 500ms | __ms | Green/Yellow/Orange/Red | __% |
| P99 Latency | < 2s | __ms | Green/Yellow/Orange/Red | __% |
| Error Rate | < 0.1% | __% | Green/Yellow/Orange/Red | __% |
| Login Success | > 99.5% | __% | Green/Yellow/Orange/Red | __% |

## Incidents Consuming Error Budget
| Date | Duration | SLO Affected | Budget Consumed | Root Cause | Post-Mortem |
|------|----------|-------------|----------------|------------|-------------|
| | | | | | |

## Error Budget Forecast
- Current burn rate: __x
- Projected budget at end of next window: __%
- Risk level: Low / Medium / High

## Action Items
| Item | Owner | Due Date | Status |
|------|-------|----------|--------|
| | | | |

## Decisions
- [ ] Budget policy level: ___
- [ ] Feature freeze: Yes / No
- [ ] Deployment restrictions: ___
```

---

## 8. Quarterly Target Reassessment

### 8.1 When to Adjust Targets

SLO targets should be reassessed when:

- Targets are consistently exceeded by a wide margin (>2x budget remaining) -- consider tightening
- Targets are frequently breached without user complaints -- may be too aggressive
- Infrastructure changes materially affect capability (e.g., multi-region deployment)
- Customer base grows significantly (10x)
- New features add latency-sensitive paths

### 8.2 Reassessment Process

1. **Data gathering** (1 week before review):
   - Pull 90-day SLI data for all SLOs
   - Collect customer complaint data correlated with SLO breaches
   - Review infrastructure cost vs. reliability investment

2. **Analysis**:
   - For each SLO, plot the actual SLI distribution against the target
   - Identify if the target is too tight (frequent breaches, no customer impact) or too loose (never breached, could be tighter)
   - Compare with industry benchmarks:
     - SaaS B2B availability: 99.9% - 99.99%
     - HR software P95 latency: 200ms - 1s
     - Error rate: 0.01% - 0.5%

3. **Decision**:
   - Propose new targets (must be approved by CTO)
   - Update this document
   - Update Prometheus alert thresholds
   - Update Grafana dashboards
   - Communicate changes to stakeholders

### 8.3 Target Evolution Path

| Phase | Availability | P95 Latency | Error Rate | Trigger |
|-------|-------------|-------------|------------|---------|
| **Launch (current)** | 99.9% | < 500ms | < 0.1% | Initial targets |
| **Growth** | 99.9% | < 300ms | < 0.05% | 1,000+ tenants |
| **Scale** | 99.95% | < 200ms | < 0.01% | Multi-region deployed |
| **Enterprise** | 99.99% | < 150ms | < 0.01% | Active-active multi-region |

---

## 9. Incident Impact Accounting

### 9.1 How Incidents Consume Budget

Each incident's impact is calculated as:

**Availability:**
```
budget_consumed_minutes = incident_duration_minutes
```
Where `incident_duration` is measured from first health check failure to last health check success.

**Error rate:**
```
budget_consumed_errors = count(5xx_responses_during_incident)
```

**Latency:**
```
budget_consumed_slow = count(requests_exceeding_slo_during_incident)
```

### 9.2 Incident Classification

| Category | Example | Budget Impact |
|----------|---------|---------------|
| **Full outage** | Database down, all requests fail | Availability + Error Rate |
| **Partial degradation** | One API instance unhealthy, others serving | Latency (if P95 affected) |
| **Elevated errors** | Bug in one endpoint causing 500s | Error Rate |
| **Auth outage** | Better Auth or Redis session cache failure | Login Success + potentially Availability |
| **Worker outage** | Background processor down | Background Processing SLO only |

### 9.3 Example Impact Calculation

> Incident: PostgreSQL connection pool exhaustion
> Duration: 12 minutes
> Impact: 80% of API requests returned 503 for 12 minutes
>
> Availability: 12 minutes consumed of 43.2 minute budget = 27.8% of budget
> Error rate: Assuming 500 req/min, 80% * 500 * 12 = 4,800 errors
>   At 1M requests/month: 4,800 / 1,000 budget = 480% of error budget (budget exhausted)
>
> Result: Error rate SLO breached. Availability SLO still within budget.

---

## 10. SLO per Module

Critical Staffora modules have module-specific latency targets reflecting their usage patterns:

| Module | P95 Latency Target | P99 Latency Target | Rationale |
|--------|--------------------|--------------------|-----------|
| **Auth** (`/api/auth/*`, `/api/v1/auth/*`) | < 300ms | < 1s | Login must feel instant |
| **Core HR** (`/api/v1/employees/*`) | < 500ms | < 2s | Standard CRUD, may involve effective-dating queries |
| **Time & Attendance** (`/api/v1/time/*`) | < 200ms | < 500ms | High-frequency clock-in/out events |
| **Absence** (`/api/v1/absence/*`) | < 500ms | < 2s | Complex balance calculations |
| **Documents** (`/api/v1/documents/*`) | < 1s | < 5s | File operations are inherently slower |
| **Analytics** (`/api/v1/analytics/*`) | < 2s | < 10s | Aggregation queries over large datasets |
| **Search** (`/api/v1/*/search`) | < 300ms | < 1s | Users expect fast search results |

These module-specific targets are informational and feed into the overall platform SLOs. They are not independently budgeted but are used for targeted performance optimization.

---

## 11. External SLA Commitments

### 11.1 Customer-Facing SLA

The external SLA offered to customers is deliberately less strict than internal SLOs to provide a safety margin:

| Metric | Internal SLO | External SLA | Buffer |
|--------|-------------|-------------|--------|
| Availability | 99.9% (43 min/month) | 99.5% (3.6 hr/month) | 3+ hours |
| API P95 latency | < 500ms | < 2s | 1.5s |
| Error rate | < 0.1% | < 1% | 10x |

### 11.2 SLA Credit Schedule

If the external SLA is breached:

| Availability | Credit |
|-------------|--------|
| 99.0% - 99.5% | 10% of monthly fee |
| 95.0% - 99.0% | 25% of monthly fee |
| < 95.0% | 50% of monthly fee |

Credits are applied to the following month's invoice. Customers must request credits within 30 days of the incident.

### 11.3 SLA Exclusions

The external SLA does not cover:
- Scheduled maintenance (72-hour advance notice)
- Features in beta or preview
- Customer-caused issues (misconfiguration, excessive API usage beyond rate limits)
- Force majeure events
- Third-party service outages beyond Staffora's control

---

## 12. Related Documents

- [Multi-Region Plan](multi-region-plan.md) -- Infrastructure architecture supporting availability SLO
- [Disaster Recovery Plan](disaster-recovery.md) -- Recovery procedures and RTO/RPO targets
- [DR Drill Schedule](dr-drill-schedule.md) -- Quarterly validation of recovery objectives
- [Production Checklist](production-checklist.md) -- Pre-launch verification items
- [Log Aggregation](log-aggregation.md) -- Loki/Promtail/Grafana for SLI measurement
- [Production Readiness Report](production-readiness-report.md) -- Platform maturity assessment
