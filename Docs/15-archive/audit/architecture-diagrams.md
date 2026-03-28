# Architecture Diagrams -- Wave 1 Audit

*Last updated: 2026-03-28*

**Project:** Staffora HRIS Platform
**Audit Date:** 2026-03-12
**Format:** Mermaid diagrams (render with any Mermaid-compatible viewer)

---

## Diagram 1: System Architecture Overview

```mermaid
graph TB
    subgraph "Client Layer"
        Browser["Browser (React SPA)"]
    end

    subgraph "Application Layer"
        API["API Server<br/>Elysia.js<br/>Port 3000"]
        Worker["Background Worker<br/>Redis Stream Consumer"]
        Scheduler["Scheduler<br/>12 Cron Jobs"]
    end

    subgraph "Data Layer"
        PG["PostgreSQL 16<br/>Port 5432<br/>RLS Enforced"]
        Redis["Redis 7<br/>Port 6379<br/>Cache + Streams"]
    end

    subgraph "External Services"
        SMTP["SMTP Server<br/>Email Delivery"]
        S3["S3-Compatible<br/>File Storage"]
        Firebase["Firebase<br/>Push Notifications"]
    end

    Browser -->|"HTTP/HTTPS"| API

    API -->|"postgres.js (20 conn)"| PG
    API -->|"pg Pool (10 conn)"| PG
    API -->|"Cache/Sessions"| Redis
    API -->|"XADD events"| Redis

    Worker -->|"XREADGROUP"| Redis
    Worker -->|"Query/Update"| PG
    Worker -->|"Send email"| SMTP
    Worker -->|"Upload files"| S3
    Worker -->|"Push notify"| Firebase

    Scheduler -->|"Trigger jobs"| Redis
    Scheduler -->|"Direct queries"| PG

    style PG fill:#336791,color:#fff
    style Redis fill:#DC382D,color:#fff
    style API fill:#4A90D9,color:#fff
    style Worker fill:#7B68EE,color:#fff
    style Scheduler fill:#7B68EE,color:#fff
```

---

## Diagram 2: HTTP Request Flow (13-Step Plugin Chain)

```mermaid
sequenceDiagram
    participant C as Client
    participant CORS as CORS
    participant SH as Security Headers
    participant ERR as Error Handler
    participant DB as DB Plugin
    participant CACHE as Cache Plugin
    participant RL as Rate Limiter
    participant BA as Better Auth Handler
    participant AUTH as Auth Plugin
    participant TEN as Tenant Plugin
    participant RBAC as RBAC Plugin
    participant IDEM as Idempotency Plugin
    participant AUD as Audit Plugin
    participant RT as Route Handler

    C->>CORS: HTTP Request
    CORS->>SH: Add CORS headers
    SH->>ERR: Add security headers (CSP, HSTS, etc.)
    ERR->>DB: Wrap in error handler, assign requestId
    DB->>CACHE: Attach db client to context
    CACHE->>RL: Attach Redis client to context
    RL->>BA: Check rate limit (if enabled)

    alt Path matches /api/auth/*
        BA->>BA: Handle auth route (sign-in, sign-up, etc.)
        BA-->>C: Return auth response
    else Other paths
        BA->>AUTH: Pass through
    end

    AUTH->>AUTH: Call getSession(), resolve user
    AUTH->>TEN: Attach user to context
    TEN->>TEN: Resolve tenant from session/header/subdomain
    TEN->>RBAC: Attach tenantId to context
    RBAC->>RBAC: Check user permissions for route
    RBAC->>IDEM: Allow or reject (403)
    IDEM->>IDEM: Check Idempotency-Key for replay

    alt Replay found
        IDEM-->>C: Return cached response
    else New request
        IDEM->>AUD: Pass through
        AUD->>RT: Begin audit context
        RT->>RT: Execute business logic
        RT->>AUD: Return response
        AUD->>AUD: Write audit log entry
        AUD-->>C: Return response
    end
```

---

## Diagram 3: Data Flow -- Transactional Outbox Pattern

```mermaid
flowchart LR
    subgraph "API Server (Synchronous)"
        REQ["HTTP Request"]
        TX["Database Transaction"]
        BW["Business Write<br/>(e.g., INSERT employee)"]
        OW["Outbox Write<br/>(INSERT domain_outbox)"]
        COMMIT["COMMIT"]
        RESP["HTTP Response"]
    end

    subgraph "Outbox Processor (Async)"
        POLL["Poll domain_outbox<br/>(unpublished events)"]
        PUB["XADD to Redis Stream"]
        MARK["Mark as published"]
    end

    subgraph "Redis Streams"
        DE["domain-events"]
        NOT["notifications"]
        EXP["exports"]
        PDF["pdf-generation"]
        ANA["analytics"]
        DLQ["dead-letters"]
    end

    subgraph "Workers"
        DEH["Domain Event Handlers"]
        NW["Notification Worker"]
        EW["Export Worker"]
        PW["PDF Worker"]
        AW["Analytics Worker"]
    end

    REQ --> TX
    TX --> BW
    TX --> OW
    BW --> COMMIT
    OW --> COMMIT
    COMMIT --> RESP

    POLL -.->|"SELECT"| TX
    POLL --> PUB
    PUB --> MARK

    PUB --> DE
    PUB --> NOT
    PUB --> EXP
    PUB --> PDF
    PUB --> ANA

    DE --> DEH
    NOT --> NW
    EXP --> EW
    PDF --> PW
    ANA --> AW

    DEH -.->|"on failure"| DLQ
    NW -.->|"on failure"| DLQ
    EW -.->|"on failure"| DLQ
    PW -.->|"on failure"| DLQ
    AW -.->|"on failure"| DLQ
```

---

## Diagram 4: Authentication Flow

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant API as API Server
    participant BA as BetterAuth
    participant PG as PostgreSQL
    participant RD as Redis

    Note over U,RD: Sign-In Flow
    U->>API: POST /api/auth/sign-in/email<br/>{email, password}
    API->>BA: Route to BetterAuth handler
    BA->>PG: SELECT from app.users WHERE email = ?
    PG-->>BA: User record (with hashed password)
    BA->>BA: bcrypt.compare(password, hash) [cost 12]

    alt Valid credentials
        BA->>PG: INSERT INTO app.sessions (userId, token, expiresAt)
        PG-->>BA: Session created
        BA->>RD: Cache session data
        BA-->>API: Set-Cookie: better-auth.session_token=<token>
        API-->>U: 200 OK + session cookie
    else Invalid credentials
        BA-->>API: 401 Unauthorized
        API-->>U: 401 {error: {code: "AUTH_INVALID_CREDENTIALS"}}
    end

    Note over U,RD: Authenticated Request Flow
    U->>API: GET /api/v1/employees<br/>Cookie: better-auth.session_token=<token>
    API->>API: Auth Plugin intercepts

    API->>RD: Check session cache
    alt Cache hit
        RD-->>API: Cached session + user data
    else Cache miss
        API->>BA: getSession(cookie)
        BA->>PG: SELECT from app.sessions JOIN app.users
        PG-->>BA: Session + user record
        BA-->>API: Resolved session
        API->>RD: Cache session
    end

    API->>API: Tenant Plugin: resolve tenant from user
    API->>PG: SET LOCAL app.current_tenant = '<tenant_id>'
    API->>API: RBAC Plugin: check permissions
    API->>PG: SELECT * FROM employees (RLS enforced)
    PG-->>API: Tenant-filtered results
    API-->>U: 200 OK {data: [...]}
```

---

## Diagram 5: Worker and Job Processing Architecture

```mermaid
flowchart TB
    subgraph "Job Sources"
        OUTBOX["Outbox Processor<br/>(polls domain_outbox)"]
        SCHED["Scheduler<br/>(12 cron jobs)"]
        API_DIRECT["API Direct<br/>(XADD from routes)"]
    end

    subgraph "Redis Streams"
        S1["Stream: domain-events<br/>Group: event-handlers"]
        S2["Stream: notifications<br/>Group: notification-workers"]
        S3["Stream: exports<br/>Group: export-workers"]
        S4["Stream: pdf-generation<br/>Group: pdf-workers"]
        S5["Stream: analytics<br/>Group: analytics-workers"]
        DLQ["Stream: dead-letters<br/>Group: dlq-handlers"]
    end

    subgraph "Consumers (6 streams, 11 processors)"
        P1["Domain Event Handlers<br/>- Employee events<br/>- Leave events<br/>- Case events<br/>- Training events"]
        P2["Notification Worker<br/>- Email (SMTP)<br/>- Push (Firebase)"]
        P3["Export Worker<br/>- Excel generation<br/>- CSV generation<br/>- S3 upload"]
        P4["PDF Worker<br/>- Certificates<br/>- Letters<br/>- Case bundles"]
        P5["Analytics Worker<br/>- Aggregation<br/>- Report generation"]
    end

    subgraph "Scheduled Jobs (12)"
        J1["Daily: Leave accrual"]
        J2["Hourly: Session cleanup"]
        J3["15min: Outbox cleanup"]
        J4["Daily: Probation reminders"]
        J5["Daily: Document expiry"]
        J6["Daily: Training deadlines"]
        J7["Daily: Time entry reminders"]
        J8["Daily: Benefits enrollment"]
        J9["Hourly: Analytics aggregation"]
        J10["Weekly: Audit archival"]
        J11["Daily: Certificate expiry"]
        J12["5min: Health check"]
    end

    OUTBOX --> S1
    OUTBOX --> S2
    API_DIRECT --> S3
    API_DIRECT --> S4

    SCHED --> J1 & J2 & J3 & J4 & J5 & J6 & J7 & J8 & J9 & J10 & J11 & J12

    S1 -->|"XREADGROUP"| P1
    S2 -->|"XREADGROUP"| P2
    S3 -->|"XREADGROUP"| P3
    S4 -->|"XREADGROUP"| P4
    S5 -->|"XREADGROUP"| P5

    P1 -.->|"Retry exceeded"| DLQ
    P2 -.->|"Retry exceeded"| DLQ
    P3 -.->|"Retry exceeded"| DLQ
    P4 -.->|"Retry exceeded"| DLQ
    P5 -.->|"Retry exceeded"| DLQ

    P1 -->|"XACK on success"| S1
    P2 -->|"XACK on success"| S2
    P3 -->|"XACK on success"| S3
    P4 -->|"XACK on success"| S4
    P5 -->|"XACK on success"| S5
```

---

## Diagram 6: Module Dependency Graph

```mermaid
graph TB
    subgraph "Shared Infrastructure"
        DB["DB Plugin"]
        CACHE["Cache Plugin"]
        AUTH["Auth Plugin"]
        TENANT["Tenant Plugin"]
        RBAC["RBAC Plugin"]
        AUDIT["Audit Plugin"]
    end

    subgraph "Core Modules"
        HR["HR Module<br/>(Gold Standard)"]
        SECURITY["Security Module<br/>(RBAC, Field Perms)"]
        TENANT_MOD["Tenant Module"]
        SYSTEM["System Module"]
    end

    subgraph "Workforce Modules"
        TIME["Time & Attendance"]
        ABSENCE["Absence Management"]
        ONBOARD["Onboarding"]
    end

    subgraph "Talent Modules"
        TALENT["Talent / Performance"]
        LMS["Learning (LMS)"]
        COMP["Competencies"]
        SUCC["Succession"]
        RECRUIT["Recruitment"]
    end

    subgraph "Operations Modules"
        CASES["Cases"]
        DOCS["Documents"]
        BENEFITS["Benefits"]
        ANALYTICS["Analytics"]
        PORTAL["Portal"]
        DASH["Dashboard"]
        REPORTS["Reports"]
        WORKFLOWS["Workflows"]
    end

    %% Infrastructure dependencies
    HR --> DB & CACHE & AUTH & TENANT & RBAC & AUDIT
    SECURITY --> DB & CACHE & AUTH & TENANT
    TENANT_MOD --> DB & CACHE & AUTH

    %% Cross-module dependencies
    ABSENCE -->|"employee lookup"| HR
    TIME -->|"employee lookup"| HR
    ONBOARD -->|"creates employee"| HR
    TALENT -->|"employee data"| HR
    LMS -->|"employee enrollment"| HR
    COMP -->|"employee skills"| HR
    SUCC -->|"employee roles"| HR
    BENEFITS -->|"employee eligibility"| HR
    CASES -->|"employee context"| HR
    DOCS -->|"employee documents"| HR
    ANALYTICS -->|"all module data"| HR
    PORTAL -->|"self-service"| HR & ABSENCE & TIME
    DASH -->|"aggregates"| HR & ABSENCE & TIME & CASES
    RECRUIT -->|"converts to employee"| HR & ONBOARD

    style HR fill:#FFD700,stroke:#333,color:#333
    style DB fill:#336791,color:#fff
    style CACHE fill:#DC382D,color:#fff
```

---

## Rendering Notes

These diagrams are written in Mermaid syntax. To render them:

1. **GitHub:** Paste into any `.md` file -- GitHub renders Mermaid natively
2. **VS Code:** Install the "Mermaid Preview" extension
3. **Online:** Use [mermaid.live](https://mermaid.live) to paste and render
4. **Documentation:** Use `mmdc` CLI to export as SVG/PNG
