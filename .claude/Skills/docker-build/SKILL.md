---
name: docker-build
description: Rebuild and restart all Docker containers (Staffora core system). Use when you need a clean rebuild of services.
---

# Docker Build All

Rebuild and restart Docker project with no cache.

## Steps

1. Stop any old/orphan containers that might conflict:
```bash
docker compose -f docker/docker-compose.yml down --remove-orphans
```

2. Rebuild all services (no cache):
```bash
docker compose -f docker/docker-compose.yml build --no-cache api web worker
```

3. Start all services:
```bash
docker compose -f docker/docker-compose.yml up -d
```

4. Verify all containers are healthy:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

## Expected Containers

| Container | Port | Compose File |
|-----------|------|-------------|
| staffora-postgres | 5432 | docker/docker-compose.yml |
| staffora-redis | 6379 | docker/docker-compose.yml |
| staffora-api | 3000 | docker/docker-compose.yml |
| staffora-worker | 3001 (health) | docker/docker-compose.yml |
| staffora-web | 5173 | docker/docker-compose.yml |
