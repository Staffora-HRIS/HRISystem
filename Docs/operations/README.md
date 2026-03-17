# Operations & Production

Production checklists, readiness reports, and operational guides for running Staffora in production.

## Files

| File | Description |
|------|-------------|
| [production-checklist.md](production-checklist.md) | Step-by-step production deployment checklist with pre-launch verification items |
| [production-readiness-report.md](production-readiness-report.md) | Assessment of production readiness covering infrastructure, security, monitoring, and operational procedures |
| [point-in-time-recovery.md](point-in-time-recovery.md) | WAL archiving configuration and step-by-step point-in-time recovery (PITR) procedures |
| [disaster-recovery.md](disaster-recovery.md) | Disaster recovery plan with RTO/RPO targets, failure scenarios, recovery procedures, backup strategy, and communication plan |
| [secret-rotation.md](secret-rotation.md) | How to rotate every platform secret with zero-downtime procedures and verification steps |
| [log-aggregation.md](log-aggregation.md) | Loki + Promtail + Grafana log aggregation setup, configuration, LogQL queries, and troubleshooting |
| [backup-verification.md](backup-verification.md) | Automated backup restore testing, SHA256 checksum validation, and integrity checks |
| [pgbouncer-guide.md](pgbouncer-guide.md) | PgBouncer connection pooler configuration, monitoring, troubleshooting, and production hardening |

## Overview

This directory contains the operational documentation needed to assess and verify production readiness. It covers:

- Pre-deployment verification steps
- Infrastructure requirements and configuration
- Database migration and backup procedures
- Monitoring and alerting requirements
- Incident response procedures
- Rollback and recovery plans

## Related Documentation

- [Docs/devops/](../devops/) -- DevOps status reports and infrastructure tasks
- [Docs/guides/DEPLOYMENT.md](../guides/DEPLOYMENT.md) -- Deployment procedures and environment setup
- [Docs/checklists/](../checklists/) -- Engineering and DevOps quality checklists
