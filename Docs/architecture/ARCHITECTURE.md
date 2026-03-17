# Architecture

*Last updated: 2026-03-17*

## System Overview

```mermaid
graph TB
    subgraph "Clients"
        Browser[React Frontend<br/>:5173]
        Mobile[Mobile App]
        External[External Systems]
    end

    subgraph "API Layer"
        API[Elysia.js API<br/>:3000]
        Swagger[Swagger UI<br/>/docs]
    end

    subgraph "Background Processing"
        Worker[Background Worker<br/>:3001]
        Scheduler[Scheduler]
    end

    subgraph "Data Layer"
        PG[(PostgreSQL 16<br/>:5432)]
        Redis[(Redis 7<br/>:6379)]
    end

    subgraph "External Services"
        SMTP[SMTP Server]
        S3[S3 Storage]
        Firebase[Firebase Push]
    end

    Browser --> API
    Mobile --> API
    External --> API
    API --> Swagger

    API --> PG
    API --> Redis
    Worker --> PG
    Worker --> Redis

    Worker --> SMTP
    Worker --> S3
    Worker --> Firebase

    Redis -- "Streams" --> Worker
    PG -- "domain_outbox" --> Worker
```

## Monorepo Structure

The project uses **Bun workspaces** to manage three packages:

```mermaid
graph LR
    subgraph "packages/"
        API["@staffora/api<br/>Elysia.js Backend"]
        Web["@staffora/web<br/>React Frontend"]
        Shared["@staffora/shared<br/>Types & Utils"]
    end

    API --> Shared
    Web --> Shared
```

| Package | Name | Description |
|---------|------|-------------|
| `packages/api` | `@staffora/api` | Elysia.js backend with plugin architecture |
| `packages/web` | `@staffora/web` | React Router v7 framework mode frontend |
| `packages/shared` | `@staffora/shared` | Shared types, schemas, error codes, state machines, utilities |

## Backend Architecture

### Plugin System

The API uses Elysia's plugin system. Plugins **must** be registered in order due to dependencies:

```mermaid
graph TD
    CORS[CORS] --> SecHeaders[Security Headers]
    SecHeaders --> Errors[errorsPlugin<br/>Error handling, request IDs]
    Errors --> DB[dbPlugin<br/>PostgreSQL connection]
    DB --> Cache[cachePlugin<br/>Redis connection]
    Cache --> RateLimit[rateLimitPlugin<br/>Request throttling]
    RateLimit --> BetterAuth[betterAuthPlugin<br/>Auth route handler]
    BetterAuth --> Auth[authPlugin<br/>Session validation]
    Auth --> Tenant[tenantPlugin<br/>Tenant resolution]
    Tenant --> RBAC[rbacPlugin<br/>Permission checks]
    RBAC --> Idempotency[idempotencyPlugin<br/>Deduplication]
    Idempotency --> Audit[auditPlugin<br/>Audit logging]
```

### Module Structure

Each feature module follows a consistent layered pattern:

```
modules/<name>/
├── routes.ts        # HTTP endpoint definitions
├── service.ts       # Business logic
├── repository.ts    # Database queries
├── schemas.ts       # TypeBox request/response schemas
└── index.ts         # Module exports
```

```mermaid
graph LR
    Route[routes.ts<br/>HTTP Layer] --> Service[service.ts<br/>Business Logic]
    Service --> Repo[repository.ts<br/>Data Access]
    Repo --> DB[(PostgreSQL)]
    Route -. validates .-> Schema[schemas.ts<br/>TypeBox Schemas]
```

### Request Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant E as Elysia
    participant Auth as Auth Plugin
    participant T as Tenant Plugin
    participant RBAC as RBAC Plugin
    participant R as Route Handler
    participant S as Service
    participant DB as PostgreSQL

    C->>E: HTTP Request
    E->>E: Error handling, Request ID
    E->>E: Rate limiting
    E->>Auth: Validate session cookie
    Auth->>DB: Check session
    Auth-->>E: User context
    E->>T: Resolve tenant
    T->>DB: SET app.current_tenant
    T-->>E: Tenant context
    E->>RBAC: Check permissions
    RBAC->>DB: Query role_assignments
    RBAC-->>E: Authorized
    E->>R: Route handler
    R->>S: Business logic
    S->>DB: Query (RLS enforced)
    DB-->>S: Results (tenant-filtered)
    S-->>R: Response data
    R-->>C: JSON Response
```

## Frontend Architecture

### Route Structure

React Router v7 file-based routing with route groups:

```
app/routes/
├── (auth)/              # Public auth pages
│   ├── login.tsx
│   └── forgot-password.tsx
├── (app)/               # Authenticated app pages
│   ├── dashboard.tsx
│   ├── employees/
│   ├── time/
│   ├── leave/
│   └── ...
└── (admin)/             # Admin-only pages
    ├── settings/
    ├── roles/
    └── audit-log/
```

### Frontend Data Flow

```mermaid
graph LR
    Component[React Component] --> Hook[React Query Hook]
    Hook --> Client[API Client]
    Client --> API[Elysia API]
    API --> Client
    Client --> Cache[React Query Cache]
    Cache --> Component
```

## Worker Architecture

```mermaid
graph TB
    subgraph "API Process"
        Handler[Route Handler]
        TX[Transaction]
        Outbox[domain_outbox table]
        Handler --> TX
        TX --> Outbox
    end

    subgraph "Worker Process"
        Poller[Outbox Poller]
        Stream[Redis Streams]
        DE[Domain Event<br/>Processor]
        NW[Notification<br/>Worker]
        EW[Export<br/>Worker]
        PW[PDF<br/>Worker]
        AW[Analytics<br/>Worker]
    end

    Outbox --> Poller
    Poller --> Stream
    Stream --> DE
    Stream --> NW
    Stream --> EW
    Stream --> PW
    Stream --> AW
```

### Redis Stream Keys

| Stream | Purpose |
|--------|---------|
| `hris:events:domain` | Domain events from outbox |
| `hris:events:notifications` | Email and push notifications |
| `hris:events:exports` | CSV/Excel report generation |
| `hris:events:pdf` | PDF document generation |
| `hris:events:analytics` | Analytics aggregation |
| `hris:events:background` | General background tasks |

## Database Architecture

### Schema Design

All tables live in the `app` schema (not `public`). Two database roles:

| Role | Purpose | RLS |
|------|---------|-----|
| `hris` | Superuser for migrations | Bypasses RLS |
| `hris_app` | Application runtime and tests | `NOBYPASSRLS` - RLS enforced |

### Multi-Tenant Isolation

```mermaid
graph TD
    Request[API Request] --> SetTenant["SET app.current_tenant = 'uuid'"]
    SetTenant --> Query[SQL Query]
    Query --> RLS[RLS Policy Check]
    RLS -->|tenant_id matches| Allow[Return Rows]
    RLS -->|tenant_id mismatch| Block[Empty Result / Error]
```

Every tenant-owned table has:
1. `tenant_id uuid NOT NULL` column
2. RLS enabled
3. `tenant_isolation` policy (SELECT/UPDATE/DELETE)
4. `tenant_isolation_insert` policy (INSERT)

### Key Cross-Cutting Patterns

| Pattern | Implementation |
|---------|---------------|
| **Effective Dating** | `effective_from`/`effective_to` columns, overlap validation |
| **Outbox Pattern** | `domain_outbox` table, same-transaction writes |
| **Idempotency** | `idempotency_keys` table, `Idempotency-Key` header |
| **Audit Trail** | `audit_log` table, partitioned by month |
| **Soft Delete** | `deleted_at` column where applicable |

---

## Related Documents

- [Database Guide](DATABASE.md) — PostgreSQL schema, migrations, and RLS conventions
- [Worker System](WORKER_SYSTEM.md) — Background job processing with Redis Streams
- [Permissions System](PERMISSIONS_SYSTEM.md) — 7-layer access control architecture
- [Architecture Map](architecture-map.md) — Detailed architecture map with diagrams
- [Repository Map](repository-map.md) — Monorepo structure and module inventory
- [Security Patterns](../patterns/SECURITY.md) — RLS, authentication, and security enforcement
- [API Reference](../api/API_REFERENCE.md) — Complete endpoint documentation
- [Deployment Guide](../guides/DEPLOYMENT.md) — Production deployment with Docker Compose
