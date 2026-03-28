# [ARCHITECTURE] Single Points of Failure in Infrastructure

> **Status: RESOLVED** (2026-03-20) — This issue has been addressed through the comprehensive remediation of all 263 audit TODOs and 41 engineering TODOs.

*Last updated: 2026-03-28*

**Priority:** CRITICAL
**Labels:** infrastructure, enhancement
**Effort:** XL

## Description
Every component in the stack runs as a single instance with no replication or failover. PostgreSQL, Redis, the API server, and the worker are all single instances. If PostgreSQL fails, the entire platform is down with no recovery mechanism other than restart. Backups are stored only in a local Docker volume, meaning they are lost if the host machine fails.

## Current State
- `docker/docker-compose.yml`: single instance of PostgreSQL, Redis, API, worker
- No PostgreSQL replication, no failover
- No Redis Sentinel or cluster
- Single API instance, no horizontal scaling
- Nginx proxies to single upstream instances
- Backups stored only in local Docker volume

## Expected State
- PostgreSQL streaming replication with automatic failover
- Redis Sentinel or Cluster for HA
- Horizontal scaling for API servers with load balancer
- Multiple worker instances using Redis Streams consumer groups
- Offsite backup storage (S3)

## Acceptance Criteria
- [ ] PostgreSQL replication configured (primary + at least 1 replica)
- [ ] Automatic failover mechanism (Patroni or pg_auto_failover)
- [ ] Redis Sentinel or Cluster deployed
- [ ] API server supports multiple instances behind load balancer
- [ ] Worker instances use consumer groups for parallel processing
- [ ] Database backups pushed to offsite storage (S3)
- [ ] Recovery time objective (RTO) documented and tested

## Implementation Notes
Start with PostgreSQL streaming replication and offsite backups as the highest-impact changes. Redis Sentinel is simpler than Cluster for the current scale. API horizontal scaling requires sticky sessions or stateless session validation (already supported via Better Auth sessions in DB).

## Affected Files
- `docker/docker-compose.yml`
- `docker/postgres/` (new replication config)
- `docker/redis/redis.conf`

## Related Issues
- infra-002-no-offsite-backups
- infra-001-no-deployment-pipeline
