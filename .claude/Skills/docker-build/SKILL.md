---
name: docker-build
description: Rebuild and restart all Docker containers (Staffora core system + Staffora website). Use when you need a clean rebuild of both services.
---

# Docker Build All

Rebuild and restart both Docker projects with no cache.

## Steps

1. Stop any old/orphan containers that might conflict:
```bash
docker compose -f docker/docker-compose.yml down --remove-orphans
docker compose -f Website/docker-compose.yml down --remove-orphans
```

2. Rebuild both projects in parallel (no cache):
```bash
# Core Staffora (api, web, worker)
docker compose -f docker/docker-compose.yml build --no-cache api web worker

# Staffora Website
docker compose -f Website/docker-compose.yml build --no-cache
```

3. Start both projects:
```bash
docker compose -f docker/docker-compose.yml up -d
docker compose -f Website/docker-compose.yml up -d
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
| staffora-website | 5174 | Website/docker-compose.yml |
