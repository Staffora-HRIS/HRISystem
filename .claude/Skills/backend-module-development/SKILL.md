---
name: backend-module-development
description: Create Elysia.js backend modules for HRIS. Use when building new API modules, routes, services, repositories, or TypeBox schemas in packages/api/src/modules/.
---

# Backend Module Development

## Module Structure
Every module in `packages/api/src/modules/` follows this pattern:

```
modules/<module-name>/
├── index.ts      # Module exports and route registration
├── routes.ts     # Elysia route definitions with TypeBox validation
├── service.ts    # Business logic layer
├── repository.ts # Database access layer (Drizzle ORM)
├── schemas.ts    # TypeBox schemas for request/response validation
```

## Creating a New Module

### 1. schemas.ts
```typescript
import { t } from 'elysia';

export const CreateEntitySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String()),
});

export const EntityResponseSchema = t.Object({
  id: t.String({ format: 'uuid' }),
  tenantId: t.String({ format: 'uuid' }),
  name: t.String(),
  createdAt: t.String({ format: 'date-time' }),
});
```

### 2. repository.ts
```typescript
import { db } from '../../db';
import { entityTable } from '../../db/schema';
import { eq } from 'drizzle-orm';

export class EntityRepository {
  async findById(id: string) {
    return db.query.entityTable.findFirst({
      where: eq(entityTable.id, id),
    });
  }

  async create(data: NewEntity, tx?: typeof db) {
    const client = tx ?? db;
    const [result] = await client.insert(entityTable).values(data).returning();
    return result;
  }
}
```

### 3. service.ts
```typescript
import { EntityRepository } from './repository';
import { domainOutbox } from '../../db/schema';

export class EntityService {
  constructor(private repo: EntityRepository) {}

  async create(data: CreateEntityInput, ctx: RequestContext) {
    return await db.transaction(async (tx) => {
      const entity = await this.repo.create({
        ...data,
        tenantId: ctx.tenantId,
      }, tx);

      // Always use outbox pattern for domain events
      await tx.insert(domainOutbox).values({
        id: crypto.randomUUID(),
        tenantId: ctx.tenantId,
        aggregateType: 'entity',
        aggregateId: entity.id,
        eventType: 'module.entity.created',
        payload: { entity, actor: ctx.userId },
        createdAt: new Date(),
      });

      return entity;
    });
  }
}
```

### 4. routes.ts
```typescript
import { Elysia, t } from 'elysia';
import { EntityService } from './service';
import { CreateEntitySchema, EntityResponseSchema } from './schemas';

export const entityRoutes = new Elysia({ prefix: '/entities' })
  .post('/', async ({ body, store }) => {
    const service = new EntityService(new EntityRepository());
    return service.create(body, store.ctx);
  }, {
    body: CreateEntitySchema,
    response: EntityResponseSchema,
  })
  .get('/:id', async ({ params, store }) => {
    const service = new EntityService(new EntityRepository());
    return service.getById(params.id, store.ctx);
  }, {
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
  });
```

### 5. Register in app.ts
```typescript
import { entityRoutes } from './modules/entity';
app.group('/api/v1', (app) => app.use(entityRoutes));
```

## Key Patterns

- **Request Context**: Access `store.ctx.tenantId`, `store.ctx.userId`, `store.ctx.session`
- **Idempotency**: All mutating endpoints require `Idempotency-Key` header
- **Error Handling**: Use `ErrorCodes` from `@hris/shared/errors`
- **Pagination**: Use cursor-based pagination, not offset
