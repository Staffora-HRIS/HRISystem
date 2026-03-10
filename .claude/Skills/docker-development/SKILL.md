---
name: docker-development
description: Manage Docker containers for local development. Use when starting services, viewing logs, or troubleshooting containers.
---

# Docker Development

## Quick Commands
```bash
bun run docker:up      # Start postgres + redis
bun run docker:down    # Stop containers
bun run docker:logs    # View logs
bun run docker:ps      # Container status
```

## Full Stack (with API + Worker)
```bash
docker compose -f docker/docker-compose.yml --profile full up -d
```

## Environment Setup
Copy `docker/.env.example` to `docker/.env`:
```env
POSTGRES_PASSWORD=your_secure_password
SESSION_SECRET=your_session_secret
CSRF_SECRET=your_csrf_secret
BETTER_AUTH_SECRET=your_auth_secret
```

## Database Connection
```
Host: localhost
Port: 5432
Database: hris
User: hris
Password: (from POSTGRES_PASSWORD in docker/.env)
```

## Redis Connection
```
Host: localhost
Port: 6379
```

## Common Issues

### Port Already in Use
```bash
netstat -ano | findstr :5432
```

### Reset Database
```bash
docker compose -f docker/docker-compose.yml down -v
bun run docker:up
bun run migrate:up
bun run db:seed
```

### View Logs
```bash
docker logs hris-postgres -f
docker logs hris-redis -f
```
