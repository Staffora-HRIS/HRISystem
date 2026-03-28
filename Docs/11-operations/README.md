# Operations & Production

*Last updated: 2026-03-21*

Production checklists, readiness reports, and operational guides for running Staffora in production.

## Files

| File | Description |
|------|-------------|
| [production-checklist.md](production-checklist.md) | Step-by-step production deployment checklist with pre-launch verification items |
| [production-readiness-report.md](production-readiness-report.md) | Assessment of production readiness covering infrastructure, security, monitoring, and operational procedures |
| [multi-region-plan.md](multi-region-plan.md) | Multi-region deployment architecture (London primary, Dublin standby) with PostgreSQL streaming replication, Redis Sentinel, DNS failover, and UK GDPR data residency compliance |
| [sla-slo-definitions.md](sla-slo-definitions.md) | Service level objectives (99.9% availability, P95 < 500ms, error rate < 0.1%), error budgets, burn rate alerts, and monthly SLO review process |
| [dr-drill-schedule.md](dr-drill-schedule.md) | Quarterly disaster recovery drill schedule, drill types (DB restore, full rebuild, DNS failover), RTO/RPO measurement protocol, drill report template, and improvement tracking |
| [disaster-recovery.md](disaster-recovery.md) | Disaster recovery plan with RTO/RPO targets, failure scenarios, recovery procedures, backup strategy, and communication plan |
| [point-in-time-recovery.md](point-in-time-recovery.md) | WAL archiving configuration and step-by-step point-in-time recovery (PITR) procedures |
| [secret-rotation.md](secret-rotation.md) | How to rotate every platform secret with zero-downtime procedures, 90-day rotation enforcement, dual-key SESSION_SECRET transition, audit logging, and verification steps |
| [centralized-logging.md](centralized-logging.md) | Centralized logging with Grafana Loki + Promtail -- architecture, structured logging, LogQL queries, alerting, and troubleshooting |
| [apm-tracing.md](apm-tracing.md) | APM and distributed tracing with OpenTelemetry and Grafana Tempo -- request tracing, performance monitoring, and trace correlation |
| [backup-verification.md](backup-verification.md) | Automated backup restore testing, SHA256 checksum validation, and integrity checks |
| [pgbouncer-guide.md](pgbouncer-guide.md) | PgBouncer connection pooler configuration, monitoring, troubleshooting, and production hardening |
| [virus-scanning.md](virus-scanning.md) | ClamAV virus scanning integration for document uploads |
| [uptime-monitoring.md](uptime-monitoring.md) | Uptime Kuma self-hosted uptime monitoring, status page, SSL certificate checks, and alert channel configuration |
| [cdn-static-assets.md](cdn-static-assets.md) | CDN and static asset caching strategy -- nginx cache headers, compression, Cloudflare/CloudFront CDN setup, UK PoP coverage, cache purge procedures |
| [ssl-certificates.md](ssl-certificates.md) | Let's Encrypt TLS certificate provisioning and automatic renewal via certbot, nginx integration, troubleshooting, and manual fallback procedures |
| [blue-green-deployment.md](blue-green-deployment.md) | Blue/green deployment strategy with nginx upstream switching, instant rollback, database migration compatibility rules, and full cutover procedure |
| [auto-scaling.md](auto-scaling.md) | Docker Swarm auto-scaling for API (2-8 replicas, CPU/memory) and worker (1-4 replicas, queue depth), with Swarm manifest and cron-based scaler script |
| [waf-protection.md](waf-protection.md) | ModSecurity v3 WAF with OWASP CRS, custom Staffora API rules, geo-blocking (UK/EU only), bot detection, and Loki log integration |
| [infrastructure-as-code.md](infrastructure-as-code.md) | Terraform IaC with modules for VPS (Hetzner), DNS (Cloudflare), firewall, and S3 backups; remote state in S3; plan-on-PR, apply-on-merge CI/CD |

## Overview

This directory contains the operational documentation needed to deploy, monitor, and maintain the Staffora platform in production. It covers:

- Pre-deployment verification steps
- Infrastructure requirements and configuration
- Multi-region deployment architecture and GDPR data residency
- Service level objectives (SLOs), error budgets, and SLA commitments
- Disaster recovery planning, drill schedules, and RTO/RPO measurement
- Database migration, backup, and point-in-time recovery procedures
- Secret rotation with audit logging and dual-key transitions
- CDN configuration, static asset caching, and compression
- Blue/green deployment with instant rollback
- Auto-scaling configuration for API and worker services
- WAF protection with ModSecurity and OWASP CRS
- Infrastructure as Code with Terraform
- Centralized logging with Grafana Loki and APM/distributed tracing with Tempo
- Uptime monitoring with status pages and SSL certificate checks
- Monitoring and alerting
- Incident response and rollback procedures

## Related Documentation

- [Docs/devops/](../devops/) -- DevOps status reports and infrastructure tasks
- [Docs/guides/DEPLOYMENT.md](../guides/DEPLOYMENT.md) -- Deployment procedures and environment setup
- [Docs/checklists/](../checklists/) -- Engineering and DevOps quality checklists
