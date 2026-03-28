# Guides

> Practical how-to documents for developers working on the Staffora platform.

*Last updated: 2026-03-28*

## Contents

| File | When to Read |
|------|-------------|
| [GETTING_STARTED.md](GETTING_STARTED.md) | First-time setup. Prerequisites, `bun install`, Docker, migrations, seed data, dev servers |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deploying to production. Docker Compose services, all environment variables, resource limits, production checklist |
| [FRONTEND.md](FRONTEND.md) | Building UI features. React Router v7 route structure, API client, React Query patterns, permission hooks, tenant hooks |

## Quick Reference

### Dev Commands

```bash
bun install                    # Install dependencies
bun run docker:up              # Start postgres + redis
bun run migrate:up             # Run migrations
bun run db:seed                # Seed data
bun run dev                    # Start all (API + web + worker)
bun test                       # Run all tests
```

### Default Ports

| Service | Port |
|---------|------|
| API | 3000 |
| Frontend | 5173 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Worker health | 3001 |

### Required Env Vars

```
POSTGRES_PASSWORD=...          # Database password
SESSION_SECRET=...             # 32+ chars
CSRF_SECRET=...                # 32+ chars
BETTER_AUTH_SECRET=...         # 32+ chars
```
